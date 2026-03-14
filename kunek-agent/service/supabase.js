'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getConfig } = require('./config');
const logger = require('./logger');

let _supabase = null;

async function initSupabase() {
  const config = getConfig();

  _supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  logger.info('Supabase client initialized — signing in as agent...');
  
  const { data, error } = await _supabase.auth.signInWithPassword({
    email: config.agentEmail,
    password: config.agentPassword,
  });

  if (error) {
    logger.error(`Authentication failed: ${error.message}`);
    throw error;
  }

  logger.info(`Authenticated. UID: ${data.user.id}`);

  return _supabase;
}

function getSupabase() {
  if (!_supabase) throw new Error('Supabase not initialized. Call initSupabase() first.');
  return _supabase;
}

module.exports = { initSupabase, getSupabase };
