import { supabase, ensureSession } from '@/lib/supabase';

// Must match submit_rush() in supabase/migrations
export const RUSH_SECONDS = 30;
export const RUSH_MAX_SCORE = 600;
export const RUSH_COUNTDOWN_SECONDS = 3;

// The leaderboard day rolls over at midnight Central, matching rush_today() in the database
export const RUSH_TIME_ZONE = 'America/Chicago';
// Day #1 of the daily Rush, for the "Morning Rush #N" share text
const RUSH_LAUNCH_DAY = '2026-10-30';

export type LeaderboardPeriod = 'today' | 'week' | 'all_time';

export interface LeaderboardRow {
  rank: number;
  handle: string;
  score: number;
  isMe: boolean;
  badges: string[];
  isChampion: boolean; // Last week's #1
}

export interface RushStats {
  playedToday: boolean;
  todayScore: number | null; // null if today's run never finished
  playedAt: string | null; // ISO timestamp of today's run
  rankToday: number | null; // null until the player claims a handle
  bestAllTime: number | null;
  currentStreak: number;
  daysPlayed: number;
  freezesAvailable: number; // Streak freezes banked (1 per 7 days played, max 2)
  streakNeedsFreeze: boolean; // Missed day(s) a freeze will cover when the player next plays
  weekTotal: number; // This week's total, for the weekly league
}

interface RushStatsRow {
  played_today: boolean;
  today_score: number | null;
  played_at: string | null;
  rank_today: number | null;
  best_all_time: number | null;
  current_streak: number;
  days_played: number;
  freezes_available: number;
  streak_needs_freeze: boolean;
  week_total: number;
}

// day: the server's Central date for the run, which decides the daily twist
export type StartRushResult = { runId: string; day: string } | { error: 'already_played' | 'failed' };
// 'rejected': the server refused the score (too late, impossible score), so retrying won't help
export type SubmitRushResult = { stats: RushStats } | { error: 'network' | 'rejected' };

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

const toStats = (row: RushStatsRow): RushStats => ({
  playedToday: row.played_today,
  todayScore: row.today_score,
  playedAt: row.played_at,
  rankToday: row.rank_today,
  bestAllTime: row.best_all_time,
  currentStreak: row.current_streak,
  daysPlayed: row.days_played,
  freezesAvailable: row.freezes_available,
  streakNeedsFreeze: row.streak_needs_freeze,
  weekTotal: row.week_total ?? 0,
});

// Asks the server to start the clock on today's run. Each player gets one run per day.
export async function startRush(): Promise<StartRushResult> {
  const result = await settle<StartRushResult>(async () => {
    const client = supabase;
    if (!client || !(await ensureSession(client))) return null;
    const { data, error } = await client.rpc('start_rush');
    if (error) return { error: error.message.includes('already_played_today') ? 'already_played' : 'failed' };
    const run = (data as { run_id: string; run_day: string }[])[0];
    return { runId: run.run_id, day: run.run_day };
  });
  return result ?? { error: 'failed' };
}

export async function submitRush(runId: string, score: number): Promise<SubmitRushResult> {
  const result = await settle<SubmitRushResult>(async () => {
    const client = supabase;
    if (!client) return null;
    const { data, error } = await client.rpc('submit_rush', { run_id: runId, final_score: score });
    if (!error) return { stats: toStats((data as RushStatsRow[])[0]) };
    // An earlier attempt already landed (its response was lost): the score is saved
    if (error.message.includes('run_already_submitted')) {
      const stats = await fetchMyRushStats();
      return stats ? { stats } : null;
    }
    if (/run_timing_invalid|score_out_of_range|run_not_found/.test(error.message)) return { error: 'rejected' };
    return null;
  });
  return result ?? { error: 'network' };
}

// The viewer's own stats. Doesn't sign anyone in: no session just means no stats yet.
export function fetchMyRushStats(): Promise<RushStats | null> {
  return settle(async () => {
    const client = supabase;
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const { data, error } = await client.rpc('my_rush_stats');
    return error ? null : toStats((data as RushStatsRow[])[0]);
  });
}

export function fetchLeaderboard(period: LeaderboardPeriod): Promise<LeaderboardRow[] | null> {
  return settle(async () => {
    const client = supabase;
    if (!client) return null;
    const { data, error } = await client.rpc('get_rush_leaderboard', { period });
    if (error) return null;
    return (data as { rank: number; handle: string; score: number; is_me: boolean; badges: string[]; is_champion: boolean }[]).map((row) => ({
      rank: row.rank,
      handle: row.handle,
      score: row.score,
      isMe: row.is_me,
      badges: row.badges ?? [],
      isChampion: row.is_champion,
    }));
  });
}

// Reports earned idle-game achievement ids for the signed-in player's profile and returns the
// profile's full badge list, Rush badges included (the server works those out from real scores).
// Null without a session or on failure.
export function syncBadges(ids: string[]) {
  return settle(async () => {
    const client = supabase;
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const { data, error } = await client.rpc('set_my_badges', { badge_ids: ids });
    return error ? null : (data as string[]);
  });
}

// --- Daily twists ---
// Each weekday's Rush has a rule that changes how it plays, not how it's scored, so the
// leaderboard stays comparable. Weekends are classic.

export type RushTwistId = 'classic' | 'moving' | 'tiny' | 'decoys' | 'blink' | 'shrink';

export interface RushTwist {
  id: RushTwistId;
  name: string;
  description: string;
}

const TWISTS: Record<RushTwistId, RushTwist> = {
  classic: { id: 'classic', name: 'Classic Rush', description: 'Just you, the boss, and 30 seconds.' },
  moving: { id: 'moving', name: 'Moving Monday', description: 'The boss won’t sit still. Chase him.' },
  tiny: { id: 'tiny', name: 'Tiny Tuesday', description: 'The boss is half size. Aim carefully.' },
  decoys: { id: 'decoys', name: 'Decoy Wednesday', description: 'Impostors show up. Tapping one costs you 3.' },
  blink: { id: 'blink', name: 'Blink Thursday', description: 'The boss keeps vanishing. Taps on thin air don’t count.' },
  shrink: { id: 'shrink', name: 'Shrinking Friday', description: 'The boss shrinks as the clock runs down.' },
};

// Sunday = 0 ... Saturday = 6
const TWIST_BY_WEEKDAY: RushTwistId[] = ['classic', 'moving', 'tiny', 'decoys', 'blink', 'shrink', 'classic'];

// The twist for an instant (by its Central date), or for a 'YYYY-MM-DD' day from the server
export function rushTwist(at: Date | string = new Date()) {
  const weekday = typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at)
    ? new Date(`${at}T12:00:00Z`).getUTCDay()
    : new Date(centralWallTime(new Date(at).getTime())).getUTCDay();
  return TWISTS[TWIST_BY_WEEKDAY[weekday]];
}

// --- Central time helpers ---

// Built once: the result screen formats the time every second
const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: RUSH_TIME_ZONE, hour: 'numeric', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: RUSH_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' });
const partsFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: RUSH_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

// "8:14 AM CT"
export const formatCentralTime = (iso: string) => `${timeFormat.format(new Date(iso))} CT`;

// "Thu, Oct 30"
export const formatCentralDate = (iso: string) => dateFormat.format(new Date(iso));

// Central wall-clock time of an instant, as if it were UTC (for day and offset math)
function centralWallTime(ms: number) {
  const parts = partsFormat.formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

// The Rush number of the Central day an instant falls on: launch day is #1, earlier is practice (<= 0)
export function rushDayNumber(at: Date | string = new Date()) {
  const wall = centralWallTime(new Date(at).getTime());
  const day = Date.UTC(new Date(wall).getUTCFullYear(), new Date(wall).getUTCMonth(), new Date(wall).getUTCDate());
  return Math.round((day - Date.parse(`${RUSH_LAUNCH_DAY}T00:00:00Z`)) / 86400000) + 1;
}

// "Rush #3", or "Practice Rush" for runs before launch day
export const rushLabel = (at?: Date | string) => {
  const n = rushDayNumber(at);
  return n >= 1 ? `Rush #${n}` : 'Practice Rush';
};

// Seconds until the next Rush unlocks at midnight Central. Uses the real UTC offset at that
// midnight, so the countdown stays right across daylight saving changes.
export function secondsUntilNextRush(now = Date.now()) {
  const wall = new Date(centralWallTime(now));
  const nextMidnightWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1);
  const guess = nextMidnightWall - (centralWallTime(now) - now);
  const offsetThen = centralWallTime(guess) - guess;
  return Math.max(0, Math.round((nextMidnightWall - offsetThen - now) / 1000));
}

// Wordle-style result to paste into a group chat
export function buildShareText(stats: RushStats, url: string) {
  const lines = [
    `Good Morning ${rushLabel(stats.playedAt ?? undefined)} (${rushTwist(stats.playedAt ?? undefined).name})`,
    `${stats.todayScore ?? 0} good mornings in ${RUSH_SECONDS}s`,
  ];
  if (stats.rankToday != null) lines.push(`#${stats.rankToday} today`);
  if (stats.currentStreak > 1) lines.push(`${stats.currentStreak}-day streak`);
  lines.push(url);
  return lines.join('\n');
}
