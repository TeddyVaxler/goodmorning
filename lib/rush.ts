import { supabase, ensureSession } from '@/lib/supabase';

// Must match submit_rush() in supabase/migrations
export const RUSH_SECONDS = 30;
export const RUSH_MAX_SCORE = 600;
export const RUSH_COUNTDOWN_SECONDS = 3;

export type LeaderboardPeriod = 'today' | 'all_time';

export interface LeaderboardRow {
  rank: number;
  handle: string;
  score: number;
  isMe: boolean;
}

export interface RushStats {
  bestToday: number | null;
  rankToday: number | null; // null until the player claims a handle
  bestAllTime: number | null;
}

interface RushStatsRow {
  best_today: number | null;
  rank_today: number | null;
  best_all_time: number | null;
}

const REQUEST_TIMEOUT_MS = 10000;

// Resolves to null if the request throws or takes too long, so a bad network can never leave
// the Rush screen waiting forever
async function settle<T>(request: () => Promise<T | null>): Promise<T | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), REQUEST_TIMEOUT_MS));
  try {
    return await Promise.race([request(), timeout]);
  } catch {
    return null;
  }
}

const toStats = (row: RushStatsRow | undefined): RushStats => ({
  bestToday: row?.best_today ?? null,
  rankToday: row?.rank_today ?? null,
  bestAllTime: row?.best_all_time ?? null,
});

// Asks the server to start the clock on a new run. Returns the run id, or null on failure.
export function startRush(): Promise<string | null> {
  return settle(async () => {
    const client = supabase;
    if (!client || !(await ensureSession(client))) return null;
    const { data, error } = await client.rpc('start_rush');
    return error ? null : (data as string);
  });
}

export function submitRush(runId: string, score: number): Promise<RushStats | null> {
  return settle(async () => {
    const client = supabase;
    if (!client) return null;
    const { data, error } = await client.rpc('submit_rush', { run_id: runId, final_score: score });
    return error ? null : toStats((data as RushStatsRow[])[0]);
  });
}

// The viewer's own stats. Doesn't sign anyone in: no session just means no stats yet.
export async function fetchMyRushStats(): Promise<RushStats | null> {
  const client = supabase;
  if (!client) return null;
  const { data: { session } } = await client.auth.getSession();
  if (!session) return null;
  const { data, error } = await client.rpc('my_rush_stats');
  return error ? null : toStats((data as RushStatsRow[])[0]);
}

export async function fetchLeaderboard(period: LeaderboardPeriod): Promise<LeaderboardRow[] | null> {
  const client = supabase;
  if (!client) return null;
  const { data, error } = await client.rpc('get_rush_leaderboard', { period });
  if (error) return null;
  return (data as { rank: number; handle: string; score: number; is_me: boolean }[]).map((row) => ({
    rank: row.rank,
    handle: row.handle,
    score: row.score,
    isMe: row.is_me,
  }));
}
