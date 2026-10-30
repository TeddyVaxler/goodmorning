"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Profile {
  handle: string; // lowercase, no leading "@"
  firstName: string;
  lastName: string;
}

// Must match the profiles_handle_format check in supabase/migrations
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
export const NAME_MAX_LENGTH = 50;

// Turns "@Teddy_V " into "teddy_v"
export const normalizeHandle = (raw: string) => raw.trim().replace(/^@+/, '').toLowerCase();

// Loads the signed-in player's profile and saves edits. Players sign in anonymously the first
// time they save, so no email is ever collected. The session lives in this browser only.
export function usePlayer() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setIsReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: { session } } = await client.auth.getSession();
      if (session) {
        const { data } = await client
          .from('profiles')
          .select('handle, first_name, last_name')
          .eq('id', session.user.id)
          .maybeSingle();
        if (!cancelled && data) {
          setProfile({ handle: data.handle, firstName: data.first_name, lastName: data.last_name });
        }
      }
      if (!cancelled) setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Returns an error message to show the player, or null on success
  const saveProfile = useCallback(async (input: Profile): Promise<string | null> => {
    const client = supabase;
    if (!client) return 'Player accounts are not set up yet.';

    let { data: { session } } = await client.auth.getSession();
    if (!session) {
      const { data, error } = await client.auth.signInAnonymously();
      if (error || !data.session) return 'Could not create your player. Try again.';
      session = data.session;
    }

    const { error } = await client.from('profiles').upsert({
      id: session.user.id,
      handle: input.handle,
      first_name: input.firstName,
      last_name: input.lastName,
    });
    if (error) {
      // 23505 = unique violation on the handle index
      return error.code === '23505'
        ? `@${input.handle} is taken. Try another.`
        : 'Could not save your profile. Try again.';
    }

    setProfile(input);
    return null;
  }, []);

  return { isEnabled: supabase !== null, isReady, profile, saveProfile };
}
