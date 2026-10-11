/**
 * Supabase client configuration.
 */

const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

let supabaseAdmin;

if (!env.supabase.url || !env.supabase.serviceKey) {
  // Defer the error to runtime so the module graph can load in test/migration
  // environments that immediately mock this client.
  supabaseAdmin = {
    auth: {
      getUser: () => {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
      },
    },
    from: () => {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
    },
    rpc: () => {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
    },
  };
} else {
  supabaseAdmin = createClient(env.supabase.url, env.supabase.serviceKey, {
    // Auth sign-in/refresh stores an in-memory user session even when persistence
    // is disabled. Pin database/storage authorization so that session cannot
    // downgrade trusted backend requests from service_role to authenticated.
    global: {
      headers: { Authorization: `Bearer ${env.supabase.serviceKey}` },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

module.exports = { supabaseAdmin };
