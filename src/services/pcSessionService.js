import { supabase } from '../supabase';

/**
 * pcSessionService.js
 * 
 * Centralized business logic for PC sessions, including starting, 
 * topping up, and ending sessions. This service handles atomic 
 * updates across stations, sessions, transactions, and logs.
 */

export const pcSessionService = {
  /**
   * Starts a new prepaid or postpaid session
   */
  async startSession({ 
    stationId, 
    stationName, 
    customerId, 
    customerName, 
    type = 'prepaid',
    rateId, 
    rateSnapshot,
    minutesAllotted = 0,
    amountDue = 0,
    amountPaid = 0,
    paymentMethod = 'Cash',
    paymentDetails = null,
    discount = { type: 'none', value: 0, amount: 0 },
    usingBalance = false,
    staffId,
    staffEmail
  }) {
    const now = new Date().toISOString();

    // 1. Create Session
    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .insert([{
        station_id: stationId,
        station_name: stationName,
        customer_id: customerId,
        customer_name: customerName || 'Walk-in',
        type,
        status: 'active',
        rate_id: rateId,
        rate_snapshot: rateSnapshot,
        started_at: now,
        minutes_allotted: minutesAllotted,
        minutes_used: 0,
        amount_charged: amountDue,
        amount_paid: amountPaid,
        payment_method: usingBalance ? 'Account Balance' : paymentMethod,
        payment_details: paymentDetails,
        discount,
        staff_id: staffId,
        created_at: now,
        updated_at: now
      }])
      .select()
      .single();

    if (sessErr) throw sessErr;

    // 2. Update Station
    const { error: stationErr } = await supabase
      .from('stations')
      .update({
        status: 'in-use',
        current_session_id: session.id,
        is_locked: false,
        updated_at: now
      })
      .eq('id', stationId);

    if (stationErr) throw stationErr;

    // 3. Update Customer Balance if applicable
    if (usingBalance && customerId) {
      const { data: cust } = await supabase
        .from('customers')
        .select('minutes_remaining')
        .eq('id', customerId)
        .maybeSingle();
        
      await supabase
        .from('customers')
        .update({
          minutes_remaining: Math.max(0, (cust?.minutes_remaining || 0) - minutesAllotted),
          updated_at: now
        })
        .eq('id', customerId);
    }

    // 4. Record Transaction
    await supabase.from('transactions').insert([{
      item: `PC Session — ${stationName}${usingBalance ? ' (Balance Use)' : ''}`,
      type: 'pc-session',
      price: usingBalance ? 0 : amountPaid,
      qty: 1,
      payment_method: usingBalance ? 'Account Balance' : paymentMethod,
      staff_email: staffEmail,
      session_id: session.id,
      station_id: stationId,
      customer_id: customerId,
      customer_name: customerName,
      discount_amount: usingBalance ? 0 : discount.amount,
      subtotal: usingBalance ? 0 : amountDue,
      created_at: now,
    }]);

    // 5. Log Event
    await supabase.from('station_logs').insert([{
      station_id: stationId,
      session_id: session.id,
      event: 'session-start',
      severity: 'info',
      timestamp: now,
      staff_id: staffId,
      station_name: stationName,
      metadata: { customerName, minutesAllotted, amountPaid, type }
    }]);

    return session;
  },

  /**
   * Adds time/prepaid credit to an active session
   */
  async topupSession({
    sessionId,
    stationId,
    stationName,
    customerName,
    addedMinutes,
    amountDue,
    amountPaid,
    paymentMethod,
    discountAmount = 0,
    staffId,
    staffEmail
  }) {
    const now = new Date().toISOString();

    // 1. Fetch current session data
    const { data: activeSession, error: fetchErr } = await supabase
      .from('sessions')
      .select('minutes_allotted, amount_paid, amount_charged')
      .eq('id', sessionId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    // 2. Update Session
    const { error: sessErr } = await supabase
      .from('sessions')
      .update({
        minutes_allotted: (activeSession.minutes_allotted || 0) + addedMinutes,
        amount_paid: (activeSession.amount_paid || 0) + amountPaid,
        amount_charged: (activeSession.amount_charged || 0) + amountDue,
        updated_at: now
      })
      .eq('id', sessionId);

    if (sessErr) throw sessErr;

    // 3. Record Transaction
    await supabase.from('transactions').insert([{
      item: `PC Top-up — ${stationName}`,
      type: 'pc-topup',
      price: amountPaid,
      qty: 1,
      payment_method: paymentMethod,
      staff_email: staffEmail,
      session_id: sessionId,
      station_id: stationId,
      customer_name: customerName,
      discount_amount: discountAmount,
      subtotal: amountDue,
      created_at: now,
    }]);

    // 4. Log Event
    await supabase.from('station_logs').insert([{
      station_id: stationId,
      session_id: sessionId,
      event: 'top-up',
      severity: 'info',
      timestamp: now,
      staff_id: staffId,
      station_name: stationName,
      metadata: { customerName, addedMinutes, amountPaid }
    }]);
  },

  /**
   * Ends an active session and releases the station
   */
  async endSession({
    sessionId,
    stationId,
    stationName,
    amountCharged,
    status = 'ended', // 'ended', 'cancelled', 'expired'
    reason = 'manual-end',
    staffId
  }) {
    const now = new Date().toISOString();

    // 1. Update Session
    const { error: sessErr } = await supabase
      .from('sessions')
      .update({
        status,
        ended_at: now,
        amount_charged: amountCharged,
        updated_at: now
      })
      .eq('id', sessionId);

    if (sessErr) throw sessErr;

    // 2. Update Station
    const { error: stationErr } = await supabase
      .from('stations')
      .update({
        status: 'available',
        current_session_id: null,
        is_locked: true,
        updated_at: now
      })
      .eq('id', stationId);

    if (stationErr) throw stationErr;

    // 3. Log Event
    await supabase.from('station_logs').insert([{
      station_id: stationId,
      session_id: sessionId,
      event: status === 'ended' ? 'session-end' : 'session-cancel',
      severity: 'info',
      timestamp: now,
      staff_id: staffId,
      station_name: stationName,
      metadata: { reason, amountCharged }
    }]);
  },

  /**
   * Authenticates a member and returns their session details if possible
   */
  async getMemberByUsername(username) {
    const { data: member, error } = await supabase
      .from('customers')
      .select('*')
      .eq('username', username.toLowerCase())
      .eq('is_active', true)
      .maybeSingle();
      
    if (error) return null;
    return member;
  }
};
