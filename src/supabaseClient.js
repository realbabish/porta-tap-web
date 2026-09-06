import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Public reporters receive a short-lived, per-ticket token. It allows them to
// attach a photo to their own newly created request without granting public
// access to every service request.
export const createReporterClient = (reporterToken) => createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {
      'x-reporter-token': reporterToken,
    },
  },
});

// Creates an isolated auth client that does NOT store or overwrite the current session.
// Allows King Admins / Customer Admins to safely provision new accounts directly without being logged out.
export const createIsolatedAuthClient = () => createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

