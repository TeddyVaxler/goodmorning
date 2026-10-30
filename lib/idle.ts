import {
  Coffee, Mail, CircleDot, Newspaper, Users, CupSoda, Megaphone, Building2, Trophy, Video,
  TreePine, Bot, Presentation, Handshake, Sunrise, type LucideIcon,
} from 'lucide-react';

// The idle game: upgrades, promotions (prestige), boss skins, multipliers, and the local save.
// Everything here is pure data and math; the game page owns the state and timers.

// ==========================================
// UPGRADES
// ==========================================
export interface Upgrade {
  id: string;
  name: string;
  type: 'click' | 'passive';
  baseCost: number;
  effect: number;
  icon: LucideIcon;
}

// Each tier costs roughly 6-8x the last; costs grow 15% per copy owned
export const UPGRADES: Upgrade[] = [
  { id: 'coffee', name: 'Extra Espresso', type: 'click', baseCost: 15, effect: 1, icon: Coffee },
  { id: 'autoreply', name: 'Auto-Responder', type: 'passive', baseCost: 50, effect: 2, icon: Mail },
  { id: 'donuts', name: 'Breakroom Donuts', type: 'passive', baseCost: 300, effect: 10, icon: CircleDot },
  { id: 'coldbrew', name: 'Cold Brew Tap', type: 'click', baseCost: 1000, effect: 8, icon: CupSoda },
  { id: 'newsletter', name: 'Company Newsletter', type: 'passive', baseCost: 1500, effect: 60, icon: Newspaper },
  { id: 'standup', name: 'Mandatory 8 AM Standup', type: 'passive', baseCost: 8000, effect: 400, icon: Users },
  { id: 'peptalk', name: 'Pep Talk', type: 'click', baseCost: 40000, effect: 60, icon: Megaphone },
  { id: 'teamscall', name: 'Recurring Teams Call', type: 'passive', baseCost: 60000, effect: 2000, icon: Video },
  { id: 'retreat', name: 'Team-Building Retreat', type: 'passive', baseCost: 450000, effect: 12000, icon: TreePine },
  { id: 'corneroffice', name: 'Corner Office', type: 'click', baseCost: 1500000, effect: 500, icon: Building2 },
  { id: 'aiassistant', name: 'AI Good-Morning Assistant', type: 'passive', baseCost: 3500000, effect: 70000, icon: Bot },
  { id: 'allhands', name: 'Company All-Hands', type: 'passive', baseCost: 25000000, effect: 400000, icon: Presentation },
  { id: 'goldenmug', name: 'Golden Mug', type: 'click', baseCost: 100000000, effect: 5000, icon: Trophy },
  { id: 'merger', name: 'Hostile Merger', type: 'passive', baseCost: 200000000, effect: 2500000, icon: Handshake },
  { id: 'sunrise', name: 'Own the Sunrise', type: 'passive', baseCost: 1500000000, effect: 15000000, icon: Sunrise },
];

export type Inventory = Record<string, number>;

export const EMPTY_INVENTORY: Inventory = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));

export const getCost = (baseCost: number, owned: number) => Math.floor(baseCost * Math.pow(1.15, owned));

// The starter upgrades always show; the rest appear once the player has ever earned half the price
const STARTER_MAX_COST = 50;
export const isUpgradeRevealed = (upgrade: Upgrade, totalMornings: number, owned: number) =>
  owned > 0 || upgrade.baseCost <= STARTER_MAX_COST || totalMornings >= upgrade.baseCost / 2;

export const upgradeDescription = (upgrade: Upgrade) =>
  upgrade.type === 'click'
    ? `+${formatNumber(upgrade.effect)} per tap`
    : `+${formatNumber(upgrade.effect)} Mornings / sec`;

const sumEffects = (inventory: Inventory, type: Upgrade['type']) =>
  UPGRADES.reduce((sum, u) => (u.type === type ? sum + u.effect * (inventory[u.id] ?? 0) : sum), 0);

// ==========================================
// PROMOTIONS (prestige)
// ==========================================
// Getting promoted resets mornings and upgrades for a permanent x2 on everything, per promotion
export const JOB_TITLES = [
  'Intern', 'Associate', 'Senior Associate', 'Manager', 'Director', 'Vice President',
  'Senior VP', 'Chief Operating Officer', 'CEO', 'Chairman of the Board',
];

export const jobTitle = (promotions: number) =>
  promotions < JOB_TITLES.length ? JOB_TITLES[promotions] : `Morning Legend ${promotions - JOB_TITLES.length + 1}`;

export const promotionMultiplier = (promotions: number) => Math.pow(2, promotions);

// Mornings to earn in the current job before the next promotion: 1M, then 10x each time
export const promotionThreshold = (promotions: number) => 1000000 * Math.pow(10, promotions);

// ==========================================
// BOSS SKINS
// ==========================================
export interface BossSkin {
  id: string;
  name: string;
  unlockAt: number; // All-time mornings needed
  overlay: string | null; // Emoji drawn over the boss
  overlayClass: string; // Where the overlay sits
  onHead: boolean; // Hidden while a seasonal hat is on, so they don't stack
  ringClass: string; // Background and border of the boss circle
}

export const BOSS_SKINS: BossSkin[] = [
  { id: 'classic', name: 'Classic', unlockAt: 0, overlay: null, overlayClass: '', onHead: false, ringClass: 'bg-[#F5A800] border-[#1A2E35]' },
  { id: 'shades', name: 'Too Cool', unlockAt: 10000, overlay: '🕶️', overlayClass: 'top-[30%] left-1/2 -translate-x-1/2 text-[38cqw]', onHead: false, ringClass: 'bg-[#7dd3fc] border-[#1A2E35]' },
  { id: 'coffee', name: 'Caffeinated', unlockAt: 100000, overlay: '☕', overlayClass: 'bottom-[4%] right-[4%] text-[30cqw]', onHead: false, ringClass: 'bg-[#c08457] border-[#1A2E35]' },
  { id: 'party', name: 'Party Boss', unlockAt: 1000000, overlay: '🥳', overlayClass: '-top-[6%] right-[2%] text-[32cqw]', onHead: true, ringClass: 'bg-[#f0abfc] border-[#1A2E35]' },
  { id: 'crown', name: 'Royal Morning', unlockAt: 100000000, overlay: '👑', overlayClass: '-top-[14%] left-1/2 -translate-x-1/2 text-[34cqw]', onHead: true, ringClass: 'bg-[#fde047] border-[#a16207]' },
  { id: 'cosmic', name: 'Cosmic Sunrise', unlockAt: 10000000000, overlay: '🌌', overlayClass: 'bottom-[2%] left-[4%] text-[28cqw]', onHead: false, ringClass: 'bg-[#4c1d95] border-[#F9CB66]' },
];

export const skinById = (id: string) => BOSS_SKINS.find((s) => s.id === id) ?? BOSS_SKINS[0];

// ==========================================
// COMBO + GOLDEN SUN
// ==========================================
export const COMBO_WINDOW_MS = 600; // Taps closer together than this keep the combo alive
export const COMBO_TIERS = [
  { taps: 0, multiplier: 1 },
  { taps: 10, multiplier: 2 },
  { taps: 25, multiplier: 3 },
  { taps: 50, multiplier: 4 },
  { taps: 100, multiplier: 5 },
];

export function comboTier(taps: number) {
  let index = 0;
  COMBO_TIERS.forEach((tier, i) => {
    if (taps >= tier.taps) index = i;
  });
  const next = COMBO_TIERS[index + 1];
  // 0..1 progress toward the next tier (full at the top tier)
  const progress = next ? (taps - COMBO_TIERS[index].taps) / (next.taps - COMBO_TIERS[index].taps) : 1;
  return { multiplier: COMBO_TIERS[index].multiplier, progress, isMax: !next };
}

export const GOLDEN_HOUR_SECONDS = 15;
export const GOLDEN_HOUR_MULTIPLIER = 7;
export const GOLDEN_SUN_VISIBLE_MS = 8000;

// Seconds until the next Golden Sun: the first comes quickly to hook new players
export const nextGoldenSunDelay = (caughtSoFar: number) =>
  caughtSoFar === 0 ? 45 + Math.random() * 45 : 120 + Math.random() * 180;

// ==========================================
// STATE + EARNINGS
// ==========================================
export interface GameState {
  mornings: number;
  inventory: Inventory;
  promotions: number;
  runMornings: number; // Earned in the current job (counts toward the next promotion)
  totalMornings: number; // Earned ever (unlocks skins and upgrades)
  totalTaps: number;
  bestCombo: number;
  goldenSunsCaught: number;
  skin: string;
  hideSeasonalHat: boolean;
}

export const NEW_GAME: GameState = {
  mornings: 0,
  inventory: EMPTY_INVENTORY,
  promotions: 0,
  runMornings: 0,
  totalMornings: 0,
  totalTaps: 0,
  bestCombo: 0,
  goldenSunsCaught: 0,
  skin: 'classic',
  hideSeasonalHat: false,
};

export const getClickPower = (game: GameState) =>
  (1 + sumEffects(game.inventory, 'click')) * promotionMultiplier(game.promotions);

export const getMps = (game: GameState) =>
  sumEffects(game.inventory, 'passive') * promotionMultiplier(game.promotions);

// Adds earnings to every running total at once
export const earn = (game: GameState, amount: number): GameState => ({
  ...game,
  mornings: game.mornings + amount,
  runMornings: game.runMornings + amount,
  totalMornings: game.totalMornings + amount,
});

export function promote(game: GameState): GameState {
  return {
    ...game,
    mornings: 0,
    inventory: EMPTY_INVENTORY,
    runMornings: 0,
    promotions: game.promotions + 1,
  };
}

// ==========================================
// SAVE (localStorage)
// ==========================================
export const SAVE_KEY = 'goodmorning-clicker-save';
const BACKUP_KEY = `${SAVE_KEY}-backup`;
// v2 added promotions, stats, skins, and new upgrades. v1 saves still load (missing fields get
// defaults), but a v1 save written by an old open tab is never adopted over a v2 one.
const SAVE_VERSION = 2;
const LEGACY_SAVE_VERSION = 1;

export interface SavedGame extends GameState {
  savedAt: number;
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const countOr = (n: unknown, fallback: number) => (isCount(n) ? n : fallback);

export function parseSave(raw: string, { allowLegacy = true } = {}): SavedGame | null {
  try {
    const data = JSON.parse(raw);
    const isKnownVersion = data?.version === SAVE_VERSION || (allowLegacy && data?.version === LEGACY_SAVE_VERSION);
    if (!isKnownVersion || !isCount(data.mornings) || !isCount(data.savedAt)) return null;

    const inventory = { ...EMPTY_INVENTORY };
    for (const u of UPGRADES) {
      const owned = data.inventory?.[u.id];
      if (isCount(owned)) inventory[u.id] = Math.floor(owned);
    }
    return {
      mornings: data.mornings,
      inventory,
      promotions: Math.floor(countOr(data.promotions, 0)),
      // Saves from before these fields existed: what they hold now is the best estimate
      runMornings: countOr(data.runMornings, data.mornings),
      totalMornings: countOr(data.totalMornings, data.mornings),
      totalTaps: countOr(data.totalTaps, 0),
      bestCombo: countOr(data.bestCombo, 0),
      goldenSunsCaught: countOr(data.goldenSunsCaught, 0),
      skin: typeof data.skin === 'string' ? data.skin : 'classic',
      hideSeasonalHat: data.hideSeasonalHat === true,
      savedAt: data.savedAt,
    };
  } catch {
    return null;
  }
}

// A save that can't be read is copied to a backup key before the fresh game autosaves over
// it, so it can still be recovered or migrated later.
export function loadSave(): SavedGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = parseSave(raw);
    if (!save) localStorage.setItem(BACKUP_KEY, raw);
    return save;
  } catch {
    return null;
  }
}

export function writeSave(game: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, ...game, savedAt: Date.now() }));
  } catch {
    // Private mode or full storage: the game still works, it just won't persist
  }
}

// ==========================================
// FORMATTING
// ==========================================
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

// 12,345 below a million, then 1.5M, 2.25B, ...
export const formatNumber = (n: number) =>
  n < 1000000 ? Math.floor(n).toLocaleString('en-US') : compact.format(n);

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(totalSeconds)}s`;
}
