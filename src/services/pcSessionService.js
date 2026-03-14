import { supabase } from '../supabase';
import { generateDisplayId, getStaffIdentity } from '../utils/idUtils';

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
    user // Added user object for identity resolution
  }) {
    const now = new Date().toISOString();
    const finalStaffId = staffId || getStaffIdentity(user);

    // 1. Create Session
    const sessId = await generateDisplayId('sessions', 'SN');
    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .insert([{
        id: sessId,
        station_id: stationId,
        customer_id: customerId,
        type,
        status: 'active',
        rate_id: rateId,
        rate_snapshot: rateSnapshot,
        start_time: now,
        minutes_allotted: minutesAllotted,
        minutes_used: 0,
        amount_charged: amountDue,
        amount_paid: amountPaid,
        payment_method: usingBalance ? 'Account Balance' : paymentMethod,
        payment_details: paymentDetails,
        discount,
        staff_id: finalStaffId,
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
    const pxId = await generateDisplayId('pc_transactions', 'PX');
    await supabase.from('pc_transactions').insert([{
      id: pxId,
      type: 'pc-session',
      amount: usingBalance ? 0 : amountPaid,
      payment_method: usingBalance ? 'Account Balance' : paymentMethod,
      staff_id: finalStaffId,
      customer_id: customerId,
      financial_category: 'PC Rental',
      category: 'Revenue',
      is_deleted: false,
      timestamp: now,
      metadata: { description: `PC Session — ${stationName}${usingBalance ? ' (Balance Use)' : ''}`, session_id: session.id, station_id: stationId },
    }]);

    // 5. Log Event
    await supabase.from('station_logs').insert([{
      station_id: stationId,
      session_id: session.id,
      event: 'session-start',
      severity: 'info',
      timestamp: now,
      staff_id: finalStaffId,
      metadata: { stationName, customerName, minutesAllotted, amountPaid, type }
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
    staffEmail,
    user // Added user object for identity resolution
  }) {
    const now = new Date().toISOString();
    const finalStaffId = staffId || getStaffIdentity(user) || staffEmail;

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
    const pxId = await generateDisplayId('pc_transactions', 'PX');
    await supabase.from('pc_transactions').insert([{
      id: pxId,
      type: 'pc-topup',
      amount: amountPaid,
      payment_method: paymentMethod,
      staff_id: finalStaffId,
      financial_category: 'PC Rental',
      category: 'Revenue',
      is_deleted: false,
      timestamp: now,
      metadata: { description: `PC Top-up — ${stationName}`, session_id: sessionId, station_id: stationId, customerName },
    }]);

    // 4. Log Event
    await supabase.from('station_logs').insert([{
      station_id: stationId,
      session_id: sessionId,
      event: 'top-up',
      severity: 'info',
      timestamp: now,
      staff_id: finalStaffId,
      metadata: { stationName, customerName, addedMinutes, amountPaid }
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
    staffId,
    user // Added user object for identity resolution
  }) {
    const now = new Date().toISOString();
    const finalStaffId = staffId || getStaffIdentity(user);

    // 1. Update Session
    const { error: sessErr } = await supabase
      .from('sessions')
      .update({
        status,
        end_time: now,
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
      staff_id: finalStaffId,
      metadata: { stationName, reason, amountCharged }
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
