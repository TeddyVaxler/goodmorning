import { UPGRADES, type GameState } from '@/lib/idle';
import type { RushStats } from '@/lib/rush';

// Achievements, earned from the idle game and the daily Rush. The ids must match the allowed
// list in set_my_badges (supabase/migrations), which shows them by the player's handle.

export interface Achievement {
  id: string;
  emoji: string;
  name: string;
  description: string;
  // Ordered roughly by difficulty: the leaderboard shows a player's hardest three
  isEarned: (game: GameState, rush: RushStats | null) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_tap', emoji: '👋', name: 'Good Morning!', description: 'Tap the boss once.', isEarned: (g) => g.totalTaps >= 1 },
  { id: 'rush_first', emoji: '⏱️', name: 'First Rush', description: 'Finish a Morning Rush.', isEarned: (_g, r) => (r?.daysPlayed ?? 0) >= 1 },
  { id: 'taps_1k', emoji: '👆', name: 'Warmed Up', description: 'Tap 1,000 times.', isEarned: (g) => g.totalTaps >= 1000 },
  { id: 'combo_25', emoji: '🔥', name: 'On a Roll', description: 'Reach a 25-tap combo.', isEarned: (g) => g.bestCombo >= 25 },
  { id: 'golden_1', emoji: '🌞', name: 'Golden Hour', description: 'Catch a Golden Sun.', isEarned: (g) => g.goldenSunsCaught >= 1 },
  { id: 'streak_3', emoji: '📅', name: 'Habit Forming', description: 'Play the Rush 3 days in a row.', isEarned: (_g, r) => (r?.currentStreak ?? 0) >= 3 },
  { id: 'mornings_1m', emoji: '💼', name: 'Millionaire', description: 'Earn 1 million mornings in total.', isEarned: (g) => g.totalMornings >= 1e6 },
  { id: 'promoted_1', emoji: '📈', name: 'Moving Up', description: 'Get promoted.', isEarned: (g) => g.promotions >= 1 },
  { id: 'rush_200', emoji: '⚡', name: 'Quick Fingers', description: 'Score 200 in a Rush.', isEarned: (_g, r) => (r?.bestAllTime ?? 0) >= 200 },
  { id: 'taps_10k', emoji: '✋', name: 'Iron Thumb', description: 'Tap 10,000 times.', isEarned: (g) => g.totalTaps >= 10000 },
  { id: 'combo_100', emoji: '💥', name: 'Max Combo', description: 'Reach a 100-tap combo (x5).', isEarned: (g) => g.bestCombo >= 100 },
  { id: 'streak_7', emoji: '🗓️', name: 'Full Week', description: 'Play the Rush 7 days in a row.', isEarned: (_g, r) => (r?.currentStreak ?? 0) >= 7 },
  // Awarded by the server once a day is over (the final rank isn't known until then)
  { id: 'rush_top3', emoji: '🥉', name: 'Podium', description: 'Finish a day in the top 3.', isEarned: () => false },
  { id: 'golden_25', emoji: '🏅', name: 'Sun Chaser', description: 'Catch 25 Golden Suns.', isEarned: (g) => g.goldenSunsCaught >= 25 },
  { id: 'own_all', emoji: '🏢', name: 'Fully Staffed', description: 'Own one of every upgrade.', isEarned: (g) => UPGRADES.every((u) => (g.inventory[u.id] ?? 0) > 0) },
  { id: 'rush_300', emoji: '🚀', name: 'Turbo', description: 'Score 300 in a Rush.', isEarned: (_g, r) => (r?.bestAllTime ?? 0) >= 300 },
  { id: 'mornings_1b', emoji: '💰', name: 'Billionaire', description: 'Earn 1 billion mornings in total.', isEarned: (g) => g.totalMornings >= 1e9 },
  { id: 'promoted_5', emoji: '🎩', name: 'Vice President', description: 'Reach VP (5 promotions).', isEarned: (g) => g.promotions >= 5 },
  { id: 'taps_100k', emoji: '🦾', name: 'Bionic Thumb', description: 'Tap 100,000 times.', isEarned: (g) => g.totalTaps >= 100000 },
  { id: 'streak_30', emoji: '🏆', name: 'Morning Person', description: 'Play the Rush 30 days in a row.', isEarned: (_g, r) => (r?.currentStreak ?? 0) >= 30 },
  { id: 'mornings_1t', emoji: '🌅', name: 'Owns the Sunrise', description: 'Earn 1 trillion mornings in total.', isEarned: (g) => g.totalMornings >= 1e12 },
  { id: 'promoted_9', emoji: '👔', name: 'Chairman', description: 'Reach Chairman of the Board.', isEarned: (g) => g.promotions >= 9 },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a, index) => [a.id, { ...a, index }]));

export const achievementById = (id: string) => BY_ID.get(id);

// Newly earned ids, given what's already been recorded
export const newlyEarned = (game: GameState, rush: RushStats | null, have: string[]) =>
  ACHIEVEMENTS.filter((a) => !have.includes(a.id) && a.isEarned(game, rush)).map((a) => a.id);

// The hardest few of a player's badges, for showing by their handle
export const topBadges = (ids: string[], count = 3) =>
  ids
    .map((id) => BY_ID.get(id))
    .filter((a): a is NonNullable<typeof a> => a !== undefined)
    .sort((a, b) => b.index - a.index)
    .slice(0, count);
