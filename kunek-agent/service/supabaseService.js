'use strict';

const { getSupabase } = require('./supabase');
const { getConfig } = require('./config');
const logger = require('./logger');

// ─── Station listener ─────────────────────────────────────────────────────────

function setupStationListener(stationId, callback) {
  const supabase = getSupabase();
  
  // Realtime subscription
  const channel = supabase.channel(`station-listener-${stationId}`)
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'stations', 
      filter: `id=eq.${stationId}` 
    }, (payload) => {
      try {
        // payload.new contains the updated record
        callback({
          exists: () => true,
          data: () => ({
            ...payload.new,
            // Map snake_case to what the agent expects (camelCase) if necessary,
            // or just update handleStationSnapshot to use snake_case.
            // Let's keep it consistent with the table field names for now.
          })
        });
      } catch (err) {
        logger.error(`Station snapshot handler error: ${err.message}`);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── Session listener ─────────────────────────────────────────────────────────

function listenToSession(sessionId, callback) {
  const supabase = getSupabase();

  const channel = supabase.channel(`session-listener-${sessionId}`)
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'sessions', 
      filter: `id=eq.${sessionId}` 
    }, (payload) => {
      try {
        callback({
          exists: () => true,
          data: () => payload.new
        });
      } catch (err) {
        logger.error(`Session snapshot handler error: ${err.message}`);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── One-shot reads ───────────────────────────────────────────────────────────

async function getSession(sessionId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) {
    logger.error(`Error fetching session ${sessionId}: ${error.message}`);
    return { exists: () => false };
  }

  return {
    exists: () => !!data,
    data: () => data
  };
}

// ─── Writes ───────────────────────────────────────────────────────────────────

async function updateSessionMinutes(sessionId, minutesUsed) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('sessions')
    .update({
      minutes_used: minutesUsed,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId);

  if (error) throw error;
}

async function endSessionOnSupabase(sessionId, stationId, reason = 'time-expired') {
  const supabase = getSupabase();
  const isExpiry = reason === 'time-expired' || reason === 'offline-timeout';
  const now = new Date().toISOString();

  try {
    // 1. Update session
    const { error: sessErr } = await supabase
      .from('sessions')
      .update({
        status: isExpiry ? 'active' : 'ended',
        ended_at: isExpiry ? null : now,
        updated_at: now
      })
      .eq('id', sessionId);

    if (sessErr) throw sessErr;

    // 2. Update station
    const { error: stationErr } = await supabase
      .from('stations')
      .update({
        status: isExpiry ? 'in-use' : 'available',
        is_locked: true,
        current_session_id: isExpiry ? sessionId : null,
        updated_at: now
      })
      .eq('id', stationId);

    if (stationErr) throw stationErr;

    // 3. Log event
    const { error: logErr } = await supabase
      .from('station_logs')
      .insert([{
        station_id: stationId,
        session_id: sessionId,
        event: isExpiry ? 'session-expired' : 'session-end',
        metadata: { reason },
        timestamp: now,
        severity: 'info'
      }]);

    if (logErr) throw logErr;

  } catch (err) {
    throw new Error(`Write failed (sessionId=${sessionId}, stationId=${stationId}): ${err.message}`);
  }
}

async function startMemberSession(stationId, member) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  try {
    // 1. Create session
    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .insert([{
        station_id: stationId,
        customer_id: member.id,
        customer_name: member.fullName || member.username,
        type: 'prepaid',
        minutes_allotted: member.minutesRemaining,
        minutes_used: 0,
        amount_charged: 0,
        amount_paid: 0,
        status: 'active',
        started_at: now,
        created_at: now,
        updated_at: now
      }])
      .select()
      .single();

    if (sessErr) throw sessErr;

    // 2. Update station
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

    // 3. Update customer balance
    const { error: custErr } = await supabase
      .from('customers')
      .update({
        minutes_remaining: 0,
        updated_at: now
      })
      .eq('id', member.id);

    if (custErr) throw custErr;

    return session.id;
  } catch (err) {
    throw err;
  }
}

async function updateStationPing(stationId, isOnline, agentVersion) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('stations')
    .update({
      is_online: isOnline,
      agent_version: agentVersion,
      last_ping: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', stationId);

  if (error) {
    logger.warn(`Failed to update station ping: ${error.message}`);
  }
}

module.exports = {
  setupStationListener,
  listenToSession,
  getSession,
  updateSessionMinutes,
  endSessionOnSupabase,
  startMemberSession,
  updateStationPing
};
