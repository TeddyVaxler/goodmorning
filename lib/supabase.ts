import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Null until the env vars are set, so the game keeps working before Supabase is hooked up
export const supabase: SupabaseClient | null = url && publishableKey ? createClient(url, publishableKey) : null;

// Returns the current session, signing in anonymously first if there isn't one (no email is
// ever collected). Null if sign-in fails.
export async function ensureSession(client: SupabaseClient) {
  const { data: { session } } = await client.auth.getSession();
  if (session) return session;
  const { data, error } = await client.auth.signInAnonymously();
  return error ? null : data.session;
}
