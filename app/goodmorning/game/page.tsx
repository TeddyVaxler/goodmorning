"use client";

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, ArrowLeft, AtSign, Timer, Trophy, CircleHelp, Palette, Volume2, VolumeX, BriefcaseBusiness, Lock, Sparkles, Medal } from 'lucide-react';
import { Montserrat } from 'next/font/google';
import Link from 'next/link';
import { usePlayer, type Profile } from '@/lib/usePlayer';
import {
  UPGRADES, NEW_GAME, BOSS_SKINS, COMBO_WINDOW_MS, GOLDEN_HOUR_SECONDS, GOLDEN_HOUR_MULTIPLIER, GOLDEN_SUN_VISIBLE_MS,
  SAVE_KEY, getCost, getClickPower, getMps, earn, promote, comboTier, nextGoldenSunDelay, isUpgradeRevealed,
  upgradeDescription, jobTitle, promotionMultiplier, promotionThreshold, skinById, loadSave, writeSave, parseSave,
  formatNumber, formatDuration, type GameState, type Upgrade,
} from '@/lib/idle';
import { playTap, playMilestone, playComboUp, playGolden, playFanfare, playUnlock, isMuted as readMuted, setMuted as storeMuted } from '@/lib/sfx';
import ProfileModal from './ProfileModal';
import MorningRush from './MorningRush';
import Leaderboard from './Leaderboard';
import Walkthrough, { WALKTHROUGH_SEEN_KEY } from './Walkthrough';
import GoldenSun from './GoldenSun';
import WardrobeModal from './WardrobeModal';
import PromotionModal from './PromotionModal';
import BossHat, { seasonFor, type Season } from './BossHat';
import AchievementsModal from './AchievementsModal';
import { PrimaryButton } from './buttons';
import { fetchMyRushStats, syncBadges, type RushStats } from '@/lib/rush';
import { achievementById, newlyEarned } from '@/lib/achievements';

const montserrat = Montserrat({ subsets: ['latin'] });

// Game data and math live in lib/idle.ts; this file owns state, timers, and the screen.

const AUTOSAVE_MS = 5000;
const TICK_MS = 250;
const FAST_TICK_MS = 150; // Combo decay and the Golden Hour countdown
const OFFLINE_CAP_SECONDS = 8 * 60 * 60; // Offline earnings stop after 8 hours away
const WELCOME_BACK_MIN_SECONDS = 60; // Shorter absences still earn, just without the popup
const TOAST_MS = 3500;

// Sun ray color per combo tier (x1 .. x5)
const RAY_COLORS = ['#F9CB66', '#fbbf24', '#f97316', '#ef4444', '#a855f7'];

interface OfflineReport {
  earned: number;
  seconds: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  label: string;
  isBig?: boolean;
}

interface Toast {
  id: number;
  text: string;
}

export default function GoodMorningClicker() {
  // --- STATE (The Game's Memory) ---
  // Score, upgrades, and stats live together so a purchase reads and writes them atomically
  const [game, setGame] = useState<GameState>(NEW_GAME);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [offlineReport, setOfflineReport] = useState<OfflineReport | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [combo, setCombo] = useState(0); // Taps in the current streak
  const [goldenSun, setGoldenSun] = useState<{ x: number; y: number } | null>(null);
  const [goldenCycle, setGoldenCycle] = useState(0); // Bumped to schedule the next Golden Sun
  const [goldenSecondsLeft, setGoldenSecondsLeft] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [season, setSeason] = useState<Season | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRushOpen, setIsRushOpen] = useState(false);
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState(false);
  const [isWardrobeOpen, setIsWardrobeOpen] = useState(false);
  const [isPromotionOpen, setIsPromotionOpen] = useState(false);
  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const [myRush, setMyRush] = useState<RushStats | null>(null); // For Rush-based achievements
  const [sidePanel, setSidePanel] = useState<'shop' | 'leaderboard'>('shop');
  const [leaderboardVersion, setLeaderboardVersion] = useState(0); // Bumped to refetch the board
  const player = usePlayer();
  const { saveProfile: savePlayerProfile } = player;

  // Refs let the long-running timers and the tap handler read fresh values without restarting
  const gameRef = useRef(game);
  const comboRef = useRef({ count: 0, lastTap: 0 });
  const goldenEndsAtRef = useRef(0);
  const tapCountRef = useRef(0); // Updated on every tap, so milestones never fire twice
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const addToast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text }].slice(-3));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  // --- MODALS ---
  const closeProfile = useCallback(() => setIsProfileOpen(false), []);
  const openProfile = useCallback(() => setIsProfileOpen(true), []);
  const openRush = useCallback(() => setIsRushOpen(true), []);
  const closeRush = useCallback(() => setIsRushOpen(false), []);
  const openWardrobe = useCallback(() => setIsWardrobeOpen(true), []);
  const closeWardrobe = useCallback(() => setIsWardrobeOpen(false), []);
  const closePromotion = useCallback(() => setIsPromotionOpen(false), []);
  const openAchievements = useCallback(() => setIsAchievementsOpen(true), []);
  const closeAchievements = useCallback(() => setIsAchievementsOpen(false), []);
  const refreshLeaderboard = useCallback(() => setLeaderboardVersion((v) => v + 1), []);
  const openWalkthrough = useCallback(() => setIsWalkthroughOpen(true), []);
  const closeWalkthrough = useCallback(() => {
    setIsWalkthroughOpen(false);
    try {
      localStorage.setItem(WALKTHROUGH_SEEN_KEY, '1');
    } catch {
      // Storage blocked: the walkthrough just shows again next visit
    }
  }, []);
  const claimHandleFromWalkthrough = useCallback(() => {
    closeWalkthrough();
    setIsProfileOpen(true);
  }, [closeWalkthrough]);
  const showLeaderboard = useCallback(() => {
    setIsRushOpen(false);
    setSidePanel('leaderboard');
  }, []);

  // While any modal is open, the game behind it can't be focused or clicked (keyboard,
  // screen readers). Set directly on the DOM: the installed React types don't know `inert` yet.
  const clickerPanelRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const isAnyModalOpen = isRushOpen || isProfileOpen || isWalkthroughOpen || isWardrobeOpen || isPromotionOpen || isAchievementsOpen || offlineReport !== null;
  const isAnyModalOpenRef = useRef(isAnyModalOpen);
  useEffect(() => {
    isAnyModalOpenRef.current = isAnyModalOpen;
    for (const panel of [clickerPanelRef.current, sidePanelRef.current]) {
      if (panel) panel.inert = isAnyModalOpen;
    }
  }, [isAnyModalOpen]);

  // First visit: walk through how to play. Waits for the save and profile to load so a
  // returning player's welcome-back popup isn't stacked under it.
  useEffect(() => {
    if (!hasLoaded || !player.isReady || offlineReport) return;
    let hasSeen = true;
    try {
      hasSeen = localStorage.getItem(WALKTHROUGH_SEEN_KEY) !== null;
    } catch {
      // Storage blocked: skip the walkthrough rather than show it on every visit
    }
    if (!hasSeen) setIsWalkthroughOpen(true);
  }, [hasLoaded, player.isReady, offlineReport]);

  // A new or changed handle changes what the leaderboard shows
  const saveProfile = useCallback(async (input: Profile) => {
    const error = await savePlayerProfile(input);
    if (!error) refreshLeaderboard();
    return error;
  }, [savePlayerProfile, refreshLeaderboard]);

  // --- DERIVED STATS ---
  const { mornings, inventory } = game;
  const isGoldenHour = goldenSecondsLeft > 0;
  const tier = comboTier(combo);
  const mps = getMps(game) * (isGoldenHour ? GOLDEN_HOUR_MULTIPLIER : 1);
  const skin = skinById(game.skin);
  const hat = game.hideSeasonalHat ? null : season;
  const nextPromotionAt = promotionThreshold(game.promotions);
  const canPromote = game.runMornings >= nextPromotionAt;

  // --- LOAD SAVE + OFFLINE EARNINGS ---
  // Runs after mount (not during render) so server and client HTML match. The ref keeps it to
  // once: React's dev mode runs effects twice, which would add the save to itself.
  const didLoadRef = useRef(false);
  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    setIsMuted(readMuted());
    setSeason(seasonFor());
    const save = loadSave();
    if (save) {
      const awaySeconds = Math.min(Math.max(0, (Date.now() - save.savedAt) / 1000), OFFLINE_CAP_SECONDS);
      const earned = getMps(save) * awaySeconds;
      const { savedAt: _savedAt, ...saved } = save;
      // Keep any taps made before the load landed
      tapCountRef.current = saved.totalTaps;
      setGame((prev) => earn(saved, prev.mornings + earned));
      if (awaySeconds >= WELCOME_BACK_MIN_SECONDS && earned >= 1) {
        setOfflineReport({ earned, seconds: awaySeconds });
      }
    }
    setHasLoaded(true);
  }, []);

  // --- AUTOSAVE ---
  // Saves every few seconds, when the tab is hidden or closed, and when leaving the page
  useEffect(() => {
    if (!hasLoaded) return;
    const save = () => writeSave(gameRef.current);
    const saveIfHidden = () => {
      if (document.visibilityState === 'hidden') save();
    };
    // Another tab saved: adopt its progress so this tab doesn't overwrite it on its next save
    const syncFromOtherTab = (e: StorageEvent) => {
      if (e.key !== SAVE_KEY || !e.newValue) return;
      const other = parseSave(e.newValue, { allowLegacy: false });
      if (other) {
        const { savedAt: _savedAt, ...state } = other;
        // Keep achievements earned here that the other tab hasn't saved yet
        setGame((prev) => ({ ...state, achievements: [...new Set([...state.achievements, ...prev.achievements])] }));
      }
    };

    const interval = setInterval(save, AUTOSAVE_MS);
    document.addEventListener('visibilitychange', saveIfHidden);
    window.addEventListener('pagehide', save);
    window.addEventListener('storage', syncFromOtherTab);
    return () => {
      save();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', saveIfHidden);
      window.removeEventListener('pagehide', save);
      window.removeEventListener('storage', syncFromOtherTab);
    };
  }, [hasLoaded]);

  // --- GAME LOOP (Passive Income) ---
  // Pays out by real elapsed time, so buying an upgrade or a throttled background tab never loses income.
  // Each payout is capped like offline earnings, so leaving the tab open doesn't beat closing it.
  useEffect(() => {
    let lastTick = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const elapsedSeconds = Math.min((now - lastTick) / 1000, OFFLINE_CAP_SECONDS);
      lastTick = now;
      const golden = goldenEndsAtRef.current > Date.now() ? GOLDEN_HOUR_MULTIPLIER : 1;
      const earned = getMps(gameRef.current) * golden * elapsedSeconds;
      if (earned > 0) setGame((prev) => earn(prev, earned));
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // --- FAST TICK: combo decay and the Golden Hour countdown ---
  useEffect(() => {
    const interval = setInterval(() => {
      if (comboRef.current.count > 0 && performance.now() - comboRef.current.lastTap > COMBO_WINDOW_MS) {
        comboRef.current.count = 0;
        setCombo(0);
      }
      const left = Math.max(0, Math.ceil((goldenEndsAtRef.current - Date.now()) / 1000));
      setGoldenSecondsLeft((prev) => (prev === left ? prev : left));
    }, FAST_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // --- GOLDEN SUN: shows up at random, stays a few seconds ---
  useEffect(() => {
    if (!hasLoaded) return;
    if (goldenSun) {
      const hide = setTimeout(() => setGoldenSun(null), GOLDEN_SUN_VISIBLE_MS);
      return () => clearTimeout(hide);
    }
    const spawn = setTimeout(() => {
      // Only when someone's looking and nothing covers the game; otherwise wait for the next one
      if (document.visibilityState === 'visible' && !isAnyModalOpenRef.current) {
        setGoldenSun({ x: 15 + Math.random() * 70, y: 25 + Math.random() * 55 });
      } else {
        setGoldenCycle((c) => c + 1);
      }
    }, nextGoldenSunDelay(gameRef.current.goldenSunsCaught) * 1000);
    return () => clearTimeout(spawn);
  }, [hasLoaded, goldenSun, goldenCycle]);

  const catchGoldenSun = useCallback(() => {
    setGoldenSun(null);
    goldenEndsAtRef.current = Date.now() + GOLDEN_HOUR_SECONDS * 1000;
    setGoldenSecondsLeft(GOLDEN_HOUR_SECONDS);
    setGame((prev) => ({ ...prev, goldenSunsCaught: prev.goldenSunsCaught + 1 }));
    playGolden();
    addToast(`Golden Hour! Everything x${GOLDEN_HOUR_MULTIPLIER} for ${GOLDEN_HOUR_SECONDS}s`);
  }, [addToast]);

  // --- UNLOCK TOASTS: new upgrades and boss skins ---
  const revealed = UPGRADES.filter((u) => isUpgradeRevealed(u, game.totalMornings, inventory[u.id]));
  const nextLocked = UPGRADES.find((u) => !isUpgradeRevealed(u, game.totalMornings, inventory[u.id]));
  const unlockedSkinCount = BOSS_SKINS.filter((s) => game.totalMornings >= s.unlockAt).length;
  const newestUpgradeName = revealed[revealed.length - 1]?.name;
  const seenUnlocksRef = useRef<{ upgrades: number; skins: number } | null>(null);
  useEffect(() => {
    if (!hasLoaded) return;
    const seen = seenUnlocksRef.current;
    seenUnlocksRef.current = { upgrades: revealed.length, skins: unlockedSkinCount };
    if (!seen) return; // First pass after loading: nothing is "new"
    if (unlockedSkinCount > seen.skins) addToast(`New boss look: ${BOSS_SKINS[unlockedSkinCount - 1].name}! Open the wardrobe to try it on`);
    if (revealed.length > seen.upgrades) addToast(`New upgrade: ${newestUpgradeName}`);
    if (unlockedSkinCount > seen.skins || revealed.length > seen.upgrades) playUnlock();
  }, [hasLoaded, revealed.length, unlockedSkinCount, newestUpgradeName, addToast]);

  // --- ACHIEVEMENTS ---
  // The player's Rush stats feed the Rush achievements; refetched whenever a Rush or handle changes
  useEffect(() => {
    if (!player.isReady || !player.isEnabled) return;
    let cancelled = false;
    fetchMyRushStats().then((stats) => {
      if (!cancelled && stats) setMyRush(stats);
    });
    return () => {
      cancelled = true;
    };
  }, [player.isReady, player.isEnabled, leaderboardVersion]);

  const earnedNow = hasLoaded ? newlyEarned(game, myRush, game.achievements) : [];
  const earnedKey = earnedNow.join(',');
  useEffect(() => {
    if (!earnedKey) return;
    const ids = earnedKey.split(',');
    setGame((prev) => ({ ...prev, achievements: [...prev.achievements, ...ids.filter((id) => !prev.achievements.includes(id))] }));
    playUnlock();
    for (const id of ids.slice(0, 2)) {
      const a = achievementById(id);
      if (a) addToast(`${a.emoji} Achievement: ${a.name}`);
    }
  }, [earnedKey, addToast]);

  // Earned badges go to the player's profile so they show on the leaderboard. The server's list
  // also has Rush badges it worked out itself (like Podium), so the two lists are merged for display.
  const [profileBadges, setProfileBadges] = useState<string[] | null>(null);
  const unsynced = player.profile && profileBadges !== null
    ? game.achievements.filter((id) => !profileBadges.includes(id))
    : [];
  const unsyncedKey = unsynced.join(',');
  const hasProfile = player.profile !== null;
  useEffect(() => {
    // Once per profile: learn what the server has (and let it add verified Rush badges)
    if (!hasProfile) return;
    let cancelled = false;
    syncBadges(gameRef.current.achievements).then((badges) => {
      if (!cancelled && badges) setProfileBadges(badges);
    });
    return () => {
      cancelled = true;
    };
  }, [hasProfile]);
  useEffect(() => {
    // After that, only when there's something the server doesn't have yet
    if (!unsyncedKey) return;
    syncBadges(unsyncedKey.split(',')).then((badges) => {
      if (!badges) return;
      setProfileBadges(badges);
      refreshLeaderboard();
    });
  }, [unsyncedKey, refreshLeaderboard]);
  const allBadges = profileBadges ? [...new Set([...game.achievements, ...profileBadges])] : game.achievements;

  // --- ACTIONS ---
  const handleBossClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Combo: taps close together keep the streak going
    const now = performance.now();
    const streak = comboRef.current;
    streak.count = now - streak.lastTap <= COMBO_WINDOW_MS ? streak.count + 1 : 1;
    streak.lastTap = now;
    const current = comboTier(streak.count);
    if (current.multiplier > comboTier(streak.count - 1).multiplier) playComboUp(current.multiplier);
    else playTap(current.multiplier);
    setCombo(streak.count);

    // Earnings use the latest state (a purchase or promotion a moment ago counts); the floating
    // number reads the last render, which can only lag by a frame
    const boost = current.multiplier * (goldenEndsAtRef.current > Date.now() ? GOLDEN_HOUR_MULTIPLIER : 1);
    const value = getClickPower(gameRef.current) * boost;
    const taps = ++tapCountRef.current;
    setGame((prev) => ({
      ...earn(prev, getClickPower(prev) * boost),
      totalTaps: prev.totalTaps + 1,
      bestCombo: Math.max(prev.bestCombo, streak.count),
    }));

    // Floating "+N" where the tap landed, and a bigger burst every 100 taps
    const rect = e.currentTarget.getBoundingClientRect();
    const added: Particle[] = [{ id: Date.now() + Math.random(), x: e.clientX - rect.left, y: e.clientY - rect.top, label: `+${formatNumber(value)}` }];
    if (taps % 100 === 0) {
      playMilestone();
      added.push({ id: Date.now() + Math.random(), x: rect.width / 2 - 50, y: rect.height / 2, label: `${formatNumber(taps)} taps!`, isBig: true });
    }
    setParticles((prev) => [...prev, ...added].slice(-20)); // Keep max 20 on screen
  }, []);

  const removeParticle = useCallback((id: number) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const buyUpgrade = useCallback((id: string, baseCost: number) => {
    // Cost and affordability are checked against the latest state, so a fast double-tap
    // can never buy two upgrades for the price of one
    setGame((prev) => {
      const cost = getCost(baseCost, prev.inventory[id]);
      if (prev.mornings < cost) return prev;
      return {
        ...prev,
        mornings: prev.mornings - cost,
        inventory: { ...prev.inventory, [id]: prev.inventory[id] + 1 },
      };
    });
  }, []);

  const acceptPromotion = useCallback(() => {
    const current = gameRef.current;
    if (current.runMornings < promotionThreshold(current.promotions)) return;
    // Saved right away: another open tab's autosave must not roll the promotion back
    const promoted = promote(current);
    gameRef.current = promoted;
    writeSave(promoted);
    setGame(promoted);
    setIsPromotionOpen(false);
    playFanfare();
    addToast(`Promoted to ${jobTitle(current.promotions + 1)}! Everything earns x${formatNumber(promotionMultiplier(current.promotions + 1))}`);
  }, [addToast]);

  const selectSkin = useCallback((id: string) => setGame((prev) => ({ ...prev, skin: id })), []);
  const toggleHat = useCallback(() => setGame((prev) => ({ ...prev, hideSeasonalHat: !prev.hideSeasonalHat })), []);
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      storeMuted(!prev);
      return !prev;
    });
  }, []);

  const multiplier = promotionMultiplier(game.promotions);
  const rayColor = RAY_COLORS[tier.multiplier - 1];

  // --- UI RENDERING ---
  return (
    // Pinned to the visible screen (fixed, not 100vh, which is taller than the screen in iPhone
    // Safari): the page itself never scrolls, only the side panel does. Side by side on desktop
    // and on phones turned sideways (`short`).
    <main className={`fixed inset-0 overflow-hidden bg-[#f4f7f5] text-[#1A2E35] ${montserrat.className} p-3 sm:p-4 md:p-8 short:p-3 squat:p-2 flex flex-col lg:flex-row short:flex-row gap-4 md:gap-8 short:gap-4 squat:gap-2 selection:bg-[#F9CB66]`}>

      {/* LEFT AREA: The Clicker Area (stays put; shrinks before the shop does) */}
      <div
        ref={clickerPanelRef}
        className={`flex-[1.5_1_0%] min-h-0 lg:flex-1 short:flex-1 min-w-0 flex flex-col items-center border-2 border-[#1A2E35] p-4 sm:p-6 short:p-3 squat:p-2 shadow-[4px_4px_0px_0px_#1A2E35] sm:shadow-[8px_8px_0px_0px_#1A2E35] relative overflow-hidden transition-colors duration-500 ${
          isGoldenHour ? 'bg-[#fffbeb]' : 'bg-white'
        }`}
      >

        {/* Nav */}
        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 short:top-3 short:left-3 z-20 flex items-center">
          <Link href="/goodmorning" aria-label="Back" className="flex items-center gap-2 text-[#006b5b] hover:text-[#F9CB66] font-bold transition-colors touch-manipulation px-1 sm:px-2 py-1">
            <ArrowLeft className="w-5 h-5" /> <span className="hidden sm:inline">Back</span>
          </Link>
          <button
            onClick={openWalkthrough}
            aria-label="How to play"
            className="p-1 text-[#006b5b] hover:text-[#1A2E35] transition-colors touch-manipulation"
          >
            <CircleHelp className="w-5 h-5" />
          </button>
        </div>

        {/* Player handle (hidden until Supabase is configured) */}
        {player.isEnabled && player.isReady && (
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6 short:top-3 short:right-3 z-20">
            <button
              onClick={openProfile}
              aria-label={player.profile ? `Edit player @${player.profile.handle}` : 'Claim your @handle'}
              className="relative flex items-center gap-1 px-2 py-1 border-2 border-[#1A2E35] bg-[#F9CB66] hover:bg-white text-[#1A2E35] text-xs sm:text-sm font-black shadow-[2px_2px_0px_0px_#1A2E35] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-colors touch-manipulation"
            >
              <AtSign className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline max-w-[10rem] truncate">
                {player.profile ? player.profile.handle : 'Claim handle'}
              </span>
              {/* Unclaimed: a pulsing dot draws the eye on phones, where the label is hidden */}
              {!player.profile && (
                <span className="absolute -top-1.5 -right-1.5 flex w-3 h-3" aria-hidden="true">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-[#006b5b] opacity-75 animate-ping" />
                  <span className="relative inline-flex w-3 h-3 rounded-full bg-[#006b5b] border border-white" />
                </span>
              )}
            </button>
          </div>
        )}

        {/* Scoreboard */}
        {/* sm:pt clears the Back link and handle badge once the title gets wide */}
        <div className="text-center space-y-1.5 sm:space-y-3 short:space-y-1 squat:space-y-1 z-10 relative shrink-0 sm:pt-10 short:pt-8 squat:pt-1">
          <h1 className="px-14 sm:px-0 text-[clamp(0.95rem,5.2vw,1.25rem)] sm:text-3xl md:text-5xl short:text-xl font-extrabold uppercase tracking-tighter text-[#1A2E35]">
            Mornings Gooded
          </h1>

          {/* Job title and progress to the next promotion; becomes the promote button when ready */}
          {canPromote ? (
            <motion.button
              onClick={() => setIsPromotionOpen(true)}
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="inline-flex items-center gap-1 px-3 py-1 bg-[#9FD085] border-2 border-[#1A2E35] text-xs sm:text-sm font-black uppercase shadow-[2px_2px_0px_0px_#1A2E35] touch-manipulation"
            >
              <BriefcaseBusiness className="w-4 h-4" /> Get Promoted!
            </motion.button>
          ) : (
            <div className="flex items-center justify-center gap-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-500">
              <span>{jobTitle(game.promotions)}{multiplier > 1 && ` · x${formatNumber(multiplier)}`}</span>
              <span className="w-16 sm:w-24 h-1.5 border border-[#1A2E35] bg-gray-100" title={`Next promotion at ${formatNumber(nextPromotionAt)} earned in this job`}>
                <span className="block h-full bg-[#9FD085]" style={{ width: `${Math.min(100, (game.runMornings / nextPromotionAt) * 100)}%` }} />
              </span>
            </div>
          )}

          <div className={`text-4xl sm:text-6xl md:text-8xl short:text-4xl squat:text-3xl font-black drop-shadow-md break-all px-2 tabular-nums ${isGoldenHour ? 'text-[#b45309]' : 'text-[#006b5b]'}`}>
            {formatNumber(mornings)}
          </div>
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <div className={`text-sm sm:text-lg font-bold border-2 border-[#1A2E35] px-3 py-1 sm:px-4 sm:py-2 shadow-[2px_2px_0px_0px_#1A2E35] ${isGoldenHour ? 'bg-[#fde047]' : 'bg-[#F9CB66]'}`}>
              {formatNumber(mps)} / sec
            </div>
            {player.isEnabled && (
              <button
                onClick={openRush}
                className="flex items-center gap-1 text-sm sm:text-lg font-bold bg-[#006b5b] hover:bg-[#F9CB66] text-white hover:text-[#1A2E35] border-2 border-[#1A2E35] px-3 py-1 sm:px-4 sm:py-2 shadow-[2px_2px_0px_0px_#1A2E35] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-colors touch-manipulation"
              >
                <Timer className="w-4 h-4 sm:w-5 sm:h-5" /> Rush
              </button>
            )}
          </div>
        </div>

        {/* The Clickable Sun/Boss. Sized from the space left in this area (container query
            units), with room above for the seasonal hat; 9rem where those units aren't supported */}
      <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center pb-5 z-10 relative [container-type:size]">
        {/* Golden Hour banner (absolute, so it doesn't push the boss around) */}
        <AnimatePresence>
          {isGoldenHour && (
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-0 z-30 flex items-center gap-1 px-3 py-1 bg-[#fde047] border-2 border-[#1A2E35] text-xs sm:text-sm font-black uppercase shadow-[2px_2px_0px_0px_#1A2E35]"
            >
              <Sparkles className="w-4 h-4" /> Golden Hour x{GOLDEN_HOUR_MULTIPLIER} · {goldenSecondsLeft}s
            </motion.div>
          )}
        </AnimatePresence>

        <div className="shrink-0 relative [container-type:size] [--boss:9rem] supports-[width:1cqh]:[--boss:min(20rem,calc((100cqh_-_1.25rem)/1.3),80cqw)] w-[var(--boss)] h-[var(--boss)] mt-[calc(var(--boss)*0.27)] touch-manipulation">

          {/* Sun rays fill in as the combo builds, and change color each tier */}
          <SunRays count={Math.round(72 * Math.min(1, combo / 100))} color={rayColor} />

          {/* The Clickable Button */}
          <motion.div
            onClick={handleBossClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`relative z-10 w-full h-full rounded-full border-4 flex items-center justify-center overflow-hidden shadow-[4px_4px_0px_0px_#1A2E35] active:shadow-none transition-all select-none cursor-pointer ${skin.ringClass}`}
          >
            <img
              src="/goodmorning.png"
              alt="Click the Boss"
              className="w-full h-full object-contain pointer-events-none select-none"
              draggable={false}
            />
          </motion.div>

          {/* Skin accessory and seasonal hat sit outside the circle so they can poke over its edge */}
          {skin.overlay && !(hat && skin.onHead) && (
            <span aria-hidden="true" className={`absolute z-20 leading-none pointer-events-none ${skin.overlayClass}`}>{skin.overlay}</span>
          )}
          {hat && <BossHat season={hat} />}

          {/* Floating Particles (+1) */}
          <AnimatePresence>
            {particles.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 1, y: p.y, x: p.x, scale: 0.5 }}
                animate={{ opacity: 0, y: p.y - (p.isBig ? 160 : 100), scale: p.isBig ? 2 : 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: p.isBig ? 1.4 : 0.8, ease: "easeOut" }}
                onAnimationComplete={() => removeParticle(p.id)}
                className={`absolute font-black pointer-events-none z-50 drop-shadow-lg whitespace-nowrap ${p.isBig ? 'text-3xl text-[#f97316]' : 'text-2xl sm:text-3xl text-[#006b5b]'}`}
                style={{ left: 0, top: 0 }}
              >
                {p.label}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Combo meter floats at the bottom of the boss area, so it never pushes the layout */}
        <div className={`absolute bottom-0 h-5 flex items-center gap-2 transition-opacity pointer-events-none ${combo >= 3 ? 'opacity-100' : 'opacity-0'}`}>
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: tier.multiplier === 1 ? '#b45309' : rayColor }}>
            Combo x{tier.multiplier}
          </span>
          <span className="w-20 sm:w-28 h-2 border border-[#1A2E35] bg-gray-100">
            <span className="block h-full" style={{ width: `${tier.progress * 100}%`, background: rayColor }} />
          </span>
        </div>
      </div>

        {/* Bottom corners: sound and wardrobe */}
        <button
          onClick={toggleMute}
          aria-label={isMuted ? 'Turn sound on' : 'Turn sound off'}
          className="absolute bottom-3 left-3 z-20 p-1.5 text-[#1A2E35] hover:text-[#006b5b] touch-manipulation"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
        <div className="absolute bottom-3 right-3 z-20 flex items-center">
          <button
            onClick={openAchievements}
            aria-label={`Achievements (${allBadges.length} earned)`}
            className="p-1.5 text-[#1A2E35] hover:text-[#006b5b] touch-manipulation"
          >
            <Medal className="w-5 h-5" />
          </button>
          <button
            onClick={openWardrobe}
            aria-label="Boss wardrobe"
            className="p-1.5 text-[#1A2E35] hover:text-[#006b5b] touch-manipulation"
          >
            <Palette className="w-5 h-5" />
          </button>
        </div>

        {/* Golden Sun */}
        <AnimatePresence>
          {goldenSun && <GoldenSun key="golden" x={goldenSun.x} y={goldenSun.y} onCatch={catchGoldenSun} />}
        </AnimatePresence>

        {/* Toasts: unlocks, promotions, Golden Hour. Never clickable, so they can't eat boss taps */}
        <div className="absolute bottom-12 inset-x-3 z-30 flex flex-col items-center gap-2 pointer-events-none">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                role="status"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-full px-3 py-2 bg-[#1A2E35] text-white text-xs sm:text-sm font-bold text-center border-2 border-[#1A2E35] shadow-[3px_3px_0px_0px_#F9CB66]"
              >
                {t.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
    </div>

      {/* RIGHT AREA: The Shop / Leaderboard. The header stays put; only the list below it scrolls. */}
      <div ref={sidePanelRef} className="flex-[1_1_0%] min-h-0 min-w-0 lg:max-w-md short:max-w-[50%] w-full flex flex-col border-2 border-[#1A2E35] bg-white shadow-[4px_4px_0px_0px_#1A2E35] sm:shadow-[8px_8px_0px_0px_#1A2E35] overflow-hidden">
        {/* Panel header: a plain title, or Shop / Leaderboard tabs once accounts are on */}
        <div className="shrink-0 mx-4 mt-4 sm:mx-6 sm:mt-6 short:mx-3 short:mt-3 border-b-4 border-[#1A2E35] pb-2 flex items-center gap-4">
          {player.isEnabled ? (
            <div role="tablist" aria-label="Side panel" className="flex items-center gap-3 sm:gap-4 min-w-0">
              <PanelTab isActive={sidePanel === 'shop'} onClick={() => setSidePanel('shop')}>
                <Sun className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-[#F9CB66] fill-current" /> Daily Grind
              </PanelTab>
              <PanelTab isActive={sidePanel === 'leaderboard'} onClick={() => setSidePanel('leaderboard')}>
                <Trophy className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-[#F9CB66]" /> Leaderboard
              </PanelTab>
            </div>
          ) : (
            <h2 className="text-xl sm:text-2xl font-extrabold uppercase flex items-center gap-2">
              <Sun className="w-5 h-5 sm:w-6 sm:h-6 text-[#F9CB66] fill-current" />
              The Daily Grind
            </h2>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4 short:px-3 short:pb-3 flex flex-col gap-3 sm:gap-4">
        {sidePanel === 'leaderboard' && player.isEnabled && (
          <Leaderboard
            refreshKey={leaderboardVersion}
            hasProfile={player.profile !== null}
            onPlayRush={openRush}
            onClaimHandle={openProfile}
          />
        )}

        {sidePanel === 'shop' && (
          <>
            {revealed.map((upgrade) => {
              const cost = getCost(upgrade.baseCost, inventory[upgrade.id]);
              return (
                <UpgradeButton
                  key={upgrade.id}
                  upgrade={upgrade}
                  multiplier={multiplier}
                  cost={cost}
                  owned={inventory[upgrade.id]}
                  canAfford={mornings >= cost}
                  onBuy={buyUpgrade}
                />
              );
            })}
            {nextLocked && <LockedUpgrade revealAt={nextLocked.baseCost / 2} />}
          </>
        )}
        </div>
      </div>

      {/* Welcome-back popup with offline earnings */}
      <AnimatePresence>
        {offlineReport && (
          <WelcomeBackModal report={offlineReport} onClose={() => setOfflineReport(null)} />
        )}
      </AnimatePresence>

      {/* How to play: first visit and the "?" button */}
      <AnimatePresence>
        {isWalkthroughOpen && (
          <Walkthrough
            accountsEnabled={player.isEnabled}
            hasProfile={player.profile !== null}
            onClaimHandle={claimHandleFromWalkthrough}
            onClose={closeWalkthrough}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isWardrobeOpen && (
          <WardrobeModal
            game={game}
            season={season}
            isMuted={isMuted}
            onSelectSkin={selectSkin}
            onToggleHat={toggleHat}
            onToggleMute={toggleMute}
            onClose={closeWardrobe}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPromotionOpen && <PromotionModal game={game} onPromote={acceptPromotion} onClose={closePromotion} />}
      </AnimatePresence>

      <AnimatePresence>
        {isAchievementsOpen && (
          <AchievementsModal earned={allBadges} hasProfile={player.profile !== null} onClose={closeAchievements} />
        )}
      </AnimatePresence>

      {/* Once-a-day, 30-second Morning Rush for the leaderboard */}
      <AnimatePresence>
        {isRushOpen && (
          <MorningRush
            hasProfile={player.profile !== null}
            isCovered={isProfileOpen}
            showHat={!game.hideSeasonalHat}
            onClaimHandle={openProfile}
            onShowLeaderboard={showLeaderboard}
            onScoreSaved={refreshLeaderboard}
            onClose={closeRush}
          />
        )}
      </AnimatePresence>

      {/* Create / edit the player's @handle and name (after Rush so it stacks on top of it) */}
      <AnimatePresence>
        {isProfileOpen && (
          <ProfileModal profile={player.profile} onSave={saveProfile} onClose={closeProfile} />
        )}
      </AnimatePresence>
    </main>
  );
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

function PanelTab({ isActive, onClick, children }: { isActive: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-[clamp(0.75rem,3.6vw,0.875rem)] sm:text-lg short:text-xs font-extrabold uppercase transition-colors touch-manipulation ${
        isActive ? 'text-[#1A2E35]' : 'text-gray-400 hover:text-[#006b5b]'
      }`}
    >
      {children}
    </button>
  );
}

// memo: the passive-income tick re-renders the game several times a second; the rays only
// need to re-render when the combo changes
const SunRays = memo(function SunRays({ count, color }: { count: number; color: string }) {
  return (
    <motion.div
    className="absolute inset-0 flex items-center justify-center pointer-events-none"
    animate={{ rotate: 360 }}
    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ height: '0%', opacity: 0 }}
          animate={{ height: '150%', opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 12 }} //stiffness is speed, damping
          // Rotates each new ray by 5 degrees (360 / 72 = 5)
          style={{ rotate: i * 5 , height: '150%', transformOrigin: 'center', background: color }}
          className="absolute origin-center w-2 sm:w-3 rounded-full"
          // The height makes the rays shoot outward past the container
        />
      ))}
    </motion.div>
  );
});

function WelcomeBackModal({ report, onClose }: { report: OfflineReport; onClose: () => void }) {
  // Escape closes the popup. Tab is held on the single button so focus can't reach the shop behind the overlay.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A2E35]/60 p-4"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-back-title"
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm max-h-full overflow-y-auto flex flex-col items-center gap-4 p-6 bg-white border-2 border-[#1A2E35] text-center shadow-[8px_8px_0px_0px_#1A2E35]"
      >
        <Sun className="w-12 h-12 text-[#F9CB66] fill-current" />
        <h2 id="welcome-back-title" className="text-2xl font-extrabold uppercase tracking-tighter">
          Welcome Back!
        </h2>
        <p className="text-sm font-bold text-gray-600">
          While you were out for {formatDuration(report.seconds)}, the boss said good morning
        </p>
        <div className="text-4xl font-black text-[#006b5b] break-all">
          +{formatNumber(report.earned)}
        </div>
        <p className="text-sm font-bold text-gray-600">times.</p>
        <PrimaryButton onClick={onClose} autoFocus>
          Clock In
        </PrimaryButton>
      </motion.div>
    </motion.div>
  );
}

interface UpgradeButtonProps {
  upgrade: Upgrade;
  multiplier: number;
  cost: number;
  owned: number;
  canAfford: boolean;
  onBuy: (id: string, baseCost: number) => void;
}

// One row in the shop
function UpgradeButton({ upgrade, multiplier, cost, owned, canAfford, onBuy }: UpgradeButtonProps) {
  const Icon = upgrade.icon;

  return (
    <button
      onClick={() => onBuy(upgrade.id, upgrade.baseCost)}
      disabled={!canAfford}
      className={`group shrink-0 flex items-center justify-between p-3 sm:p-4 short:p-2 border-2 border-[#1A2E35] text-left transition-all touch-manipulation ${
        canAfford
        ? 'bg-white hover:bg-[#F9CB66] shadow-[3px_3px_0px_0px_#1A2E35] hover:translate-y-[2px] hover:translate-x-[2px] cursor-pointer hover:shadow-none'
        : 'bg-gray-100 opacity-70 cursor-not-allowed'
      }`}
    >
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <div className={`p-2 sm:p-3 short:p-1.5 border-2 border-[#1A2E35] shrink-0 ${canAfford ? 'bg-[#006b5b] text-white' : 'bg-gray-300 text-gray-600'}`}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-sm sm:text-lg short:text-sm leading-tight">{upgrade.name}</h3>
          <p className="text-[10px] sm:text-xs font-bold text-gray-600">
            {upgradeDescription({ ...upgrade, effect: upgrade.effect * multiplier })}
          </p>
          <p className={`text-xs sm:text-sm font-black mt-1 ${canAfford ? 'text-[#006b5b]' : 'text-red-500'}`}>
            Cost: {formatNumber(cost)}
          </p>
        </div>
      </div>

      <div className="text-xl sm:text-3xl short:text-xl font-black text-gray-300 group-hover:text-[#1A2E35] transition-colors px-2">
        {owned}
      </div>
    </button>
  );
}

// Teaser for the next upgrade tier
function LockedUpgrade({ revealAt }: { revealAt: number }) {
  return (
    <div className="shrink-0 flex items-center gap-3 sm:gap-4 p-3 sm:p-4 short:p-2 border-2 border-dashed border-gray-400 text-gray-500">
      <div className="p-2 sm:p-3 short:p-1.5 border-2 border-dashed border-gray-400 shrink-0">
        <Lock className="w-5 h-5 sm:w-6 sm:h-6" />
      </div>
      <div>
        <h3 className="font-bold text-sm sm:text-lg short:text-sm leading-tight">???</h3>
        <p className="text-[10px] sm:text-xs font-bold">Earn {formatNumber(revealAt)} total mornings to reveal</p>
      </div>
    </div>
  );
}
