import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Null until the env vars are set, so the game keeps working before Supabase is hooked up
export const supabase: SupabaseClient | null = url && publishableKey ? createClient(url, publishableKey) : null;
