"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Coffee, Mail, CircleDot, Newspaper, Users, ArrowLeft, AtSign, Timer, Trophy, CircleHelp } from 'lucide-react';
import { Montserrat } from 'next/font/google';
import Link from 'next/link';
import { usePlayer, type Profile } from '@/lib/usePlayer';
import ProfileModal from './ProfileModal';
import MorningRush from './MorningRush';
import Leaderboard from './Leaderboard';
import Walkthrough, { WALKTHROUGH_SEEN_KEY } from './Walkthrough';
import { PrimaryButton } from './buttons';

const montserrat = Montserrat({ subsets: ['latin'] });

// ==========================================
// 1. GAME DATA (Easy to edit and expand!)
// ==========================================
const UPGRADES = [
  { id: 'coffee', name: 'Extra Espresso', type: 'click', baseCost: 15, effect: 1, icon: Coffee, desc: '+1 Morning per click' },
  { id: 'autoreply', name: 'Auto-Responder', type: 'passive', baseCost: 50, effect: 2, icon: Mail, desc: '+2 Mornings / sec' },
  { id: 'donuts', name: 'Breakroom Donuts', type: 'passive', baseCost: 300, effect: 10, icon: CircleDot, desc: '+10 Mornings / sec' },
  { id: 'newsletter', name: 'Company Newsletter', type: 'passive', baseCost: 1500, effect: 60, icon: Newspaper, desc: '+60 Mornings / sec' },
  { id: 'standup', name: 'Mandatory 8 AM Standup', type: 'passive', baseCost: 8000, effect: 400, icon: Users, desc: '+400 Mornings / sec' },
];

const SAVE_KEY = 'goodmorning-clicker-save';
const BACKUP_KEY = `${SAVE_KEY}-backup`;
const SAVE_VERSION = 1;
const AUTOSAVE_MS = 5000;
const TICK_MS = 250;
const OFFLINE_CAP_SECONDS = 8 * 60 * 60; // Offline earnings stop after 8 hours away
const WELCOME_BACK_MIN_SECONDS = 60; // Shorter absences still earn, just without the popup

// ==========================================
// 2. TYPES
// ==========================================
type Inventory = Record<string, number>;

interface GameState {
  mornings: number;
  inventory: Inventory;
}

interface SavedGame extends GameState {
  savedAt: number;
}

interface OfflineReport {
  earned: number;
  seconds: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  value: number;
}

// ==========================================
// 3. GAME MATH + SAVE SYSTEM
// ==========================================
const EMPTY_INVENTORY: Inventory = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));

const getCost = (baseCost: number, owned: number) => Math.floor(baseCost * Math.pow(1.15, owned));

const sumEffects = (inventory: Inventory, type: 'click' | 'passive') =>
  UPGRADES.reduce((sum, u) => (u.type === type ? sum + u.effect * inventory[u.id] : sum), 0);

const getClickPower = (inventory: Inventory) => 1 + sumEffects(inventory, 'click');
const getMps = (inventory: Inventory) => sumEffects(inventory, 'passive');

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

function parseSave(raw: string): SavedGame | null {
  try {
    const data = JSON.parse(raw);
    if (data?.version !== SAVE_VERSION || !isCount(data.mornings) || !isCount(data.savedAt)) return null;

    const inventory = { ...EMPTY_INVENTORY };
    for (const u of UPGRADES) {
      const owned = data.inventory?.[u.id];
      if (isCount(owned)) inventory[u.id] = Math.floor(owned);
    }
    return { mornings: data.mornings, inventory, savedAt: data.savedAt };
  } catch {
    return null;
  }
}

// Reads the save from localStorage. A save that can't be read is copied to a backup key
// before the fresh game autosaves over it, so it can still be recovered or migrated later.
function loadSave(): SavedGame | null {
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

function writeSave(game: GameState) {
  try {
    const save = { version: SAVE_VERSION, ...game, savedAt: Date.now() };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Private mode or full storage: the game still works, it just won't persist
  }
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(totalSeconds)}s`;
}

// ==========================================
// 4. MAIN GAME COMPONENT
// ==========================================
export default function GoodMorningClicker() {
  // --- STATE (The Game's Memory) ---
  // Score and inventory live together so a purchase reads and writes both atomically
  const [game, setGame] = useState<GameState>({ mornings: 0, inventory: EMPTY_INVENTORY });
  const [hasLoaded, setHasLoaded] = useState(false);
  const [offlineReport, setOfflineReport] = useState<OfflineReport | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [rayCount, setRayCount] = useState(0); // Tracks the sun rays!
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRushOpen, setIsRushOpen] = useState(false);
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<'shop' | 'leaderboard'>('shop');
  const [leaderboardVersion, setLeaderboardVersion] = useState(0); // Bumped to refetch the board
  const player = usePlayer();
  const { saveProfile: savePlayerProfile } = player;

  const closeProfile = useCallback(() => setIsProfileOpen(false), []);
  const openProfile = useCallback(() => setIsProfileOpen(true), []);
  const openRush = useCallback(() => setIsRushOpen(true), []);
  const closeRush = useCallback(() => setIsRushOpen(false), []);
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
  const isAnyModalOpen = isRushOpen || isProfileOpen || isWalkthroughOpen || offlineReport !== null;
  useEffect(() => {
    for (const panel of [clickerPanelRef.current, sidePanelRef.current]) {
      if (panel) panel.inert = isAnyModalOpen;
    }
  }, [isAnyModalOpen]);

  // First visit: walk through how to play. Waits for the save to load so a returning player's
  // welcome-back popup isn't stacked under it.
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
  const { mornings, inventory } = game;

  // --- DERIVED STATS (Math calculated automatically) ---
  const clickPower = useMemo(() => getClickPower(inventory), [inventory]);
  const mps = useMemo(() => getMps(inventory), [inventory]);

  // A ref lets the long-running timers read fresh state without restarting
  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  // --- LOAD SAVE + OFFLINE EARNINGS ---
  // Runs after mount (not during render) so server and client HTML match
  useEffect(() => {
    const save = loadSave();
    if (save) {
      const awaySeconds = Math.min(Math.max(0, (Date.now() - save.savedAt) / 1000), OFFLINE_CAP_SECONDS);
      const earned = getMps(save.inventory) * awaySeconds;
      // Keep any clicks made before the load landed (inventory is still empty at this point)
      setGame((prev) => ({ mornings: prev.mornings + save.mornings + earned, inventory: save.inventory }));
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
      const save = parseSave(e.newValue);
      if (save) setGame({ mornings: save.mornings, inventory: save.inventory });
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
      const earned = getMps(gameRef.current.inventory) * elapsedSeconds;
      if (earned > 0) setGame((prev) => ({ ...prev, mornings: prev.mornings + earned }));
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // --- ACTIONS (What happens when you click) ---
  const handleBossClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 1. Add score
    setGame((prev) => ({ ...prev, mornings: prev.mornings + clickPower }));
    
    // 2. Add a Sun Ray (Caps at 72 rays to form a full circle)
    setRayCount((prev) => (prev < 72 ? prev + 1 : prev));

    // 3. Spawn floating text particle
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newParticle = { id: Date.now() + Math.random(), x, y, value: clickPower };
    setParticles((prev) => [...prev, newParticle].slice(-20)); // Keep max 20 on screen
  }, [clickPower]);

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
        mornings: prev.mornings - cost,
        inventory: { ...prev.inventory, [id]: prev.inventory[id] + 1 },
      };
    });
  }, []);

  // --- UI RENDERING ---
  return (
    // Pinned to the visible screen (fixed, not 100vh, which is taller than the screen in iPhone
    // Safari): the page itself never scrolls, only the side panel does. Side by side on desktop
    // and on phones turned sideways (`short`).
    <main className={`fixed inset-0 overflow-hidden bg-[#f4f7f5] text-[#1A2E35] ${montserrat.className} p-3 sm:p-4 md:p-8 short:p-3 flex flex-col lg:flex-row short:flex-row gap-4 md:gap-8 short:gap-4 selection:bg-[#F9CB66]`}>

      {/* LEFT AREA: The Clicker Area (stays put) */}
      <div ref={clickerPanelRef} className="shrink min-h-0 lg:flex-1 short:flex-1 min-w-0 flex flex-col items-center border-2 border-[#1A2E35] bg-white p-4 sm:p-6 short:p-3 shadow-[4px_4px_0px_0px_#1A2E35] sm:shadow-[8px_8px_0px_0px_#1A2E35] relative overflow-hidden">
        
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
        <div className="text-center space-y-2 sm:space-y-4 short:space-y-1 z-10 relative shrink-0 sm:pt-10 short:pt-8">
          <h1 className="px-14 sm:px-0 text-[clamp(0.95rem,5.2vw,1.25rem)] sm:text-3xl md:text-5xl short:text-xl font-extrabold uppercase tracking-tighter text-[#1A2E35]">
            Mornings Gooded
          </h1>
          <div className="text-4xl sm:text-6xl md:text-8xl short:text-4xl font-black text-[#006b5b] drop-shadow-md break-all px-2">
            {Math.floor(mornings).toLocaleString()}
          </div>
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <div className="text-sm sm:text-lg font-bold bg-[#F9CB66] border-2 border-[#1A2E35] px-3 py-1 sm:px-4 sm:py-2 shadow-[2px_2px_0px_0px_#1A2E35]">
              {mps.toLocaleString()} / sec
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

        {/* The Clickable Sun/Boss */}
      {/* Boss size is capped by screen height so short phones still leave room for the shop */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center mt-2 sm:mt-8 short:mt-1 z-10 relative">
        <div className="my-6 sm:my-8 short:my-3 relative w-36 h-36 sm:w-56 sm:h-56 md:w-72 md:h-72 short:w-28 short:h-28 supports-[height:1dvh]:w-[min(12rem,25dvh)] supports-[height:1dvh]:h-[min(12rem,25dvh)] sm:supports-[height:1dvh]:w-[min(16rem,30dvh)] sm:supports-[height:1dvh]:h-[min(16rem,30dvh)] md:supports-[height:1dvh]:w-[min(20rem,40dvh)] md:supports-[height:1dvh]:h-[min(20rem,40dvh)] short:supports-[height:1dvh]:w-[min(12rem,30dvh)] short:supports-[height:1dvh]:h-[min(12rem,30dvh)] touch-manipulation">
          
          {/* THE NEW SUN RAYS BACKGROUND */}
          <SunRays count={rayCount} />

          {/* The Clickable Button */}
          <motion.div 
            onClick={handleBossClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative z-10 w-full h-full rounded-full border-4 border-[#1A2E35] bg-[#F5A800] flex items-center justify-center overflow-hidden shadow-[4px_4px_0px_0px_#1A2E35] active:shadow-none transition-all select-none cursor-pointer"
          >
            <img 
              src="/goodmorning.png" 
              alt="Click the Boss"
              className="w-full h-full object-contain pointer-events-none select-none"
              draggable={false}
            />
          </motion.div>

          {/* Floating Particles (+1) */}
          <AnimatePresence>
            {particles.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 1, y: p.y, x: p.x, scale: 0.5 }}
                animate={{ opacity: 0, y: p.y - 100, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                onAnimationComplete={() => removeParticle(p.id)} 
                className="absolute text-2xl sm:text-3xl font-black text-[#006b5b] pointer-events-none z-50 drop-shadow-lg"
                style={{ left: 0, top: 0 }}
              >
                +{p.value}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>

      {/* RIGHT AREA: The Shop / Leaderboard. The header stays put; only the list below it scrolls. */}
      <div ref={sidePanelRef} className="flex-1 min-h-[45%] lg:min-h-0 short:min-h-0 min-w-0 lg:max-w-md short:max-w-[50%] w-full flex flex-col border-2 border-[#1A2E35] bg-white shadow-[4px_4px_0px_0px_#1A2E35] sm:shadow-[8px_8px_0px_0px_#1A2E35] overflow-hidden">
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

        {sidePanel === 'shop' && UPGRADES.map((upgrade) => {
          // Calculate the current cost based on how many you already own
          const cost = getCost(upgrade.baseCost, inventory[upgrade.id]);
          const canAfford = mornings >= cost;

          // Instead of a massive block of HTML here, we use our extracted component!
          return (
            <UpgradeButton
              key={upgrade.id}
              upgrade={upgrade}
              cost={cost}
              owned={inventory[upgrade.id]}
              canAfford={canAfford}
              onBuy={() => buyUpgrade(upgrade.id, upgrade.baseCost)}
            />
          );
        })}
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

      {/* Once-a-day, 30-second Morning Rush for the leaderboard */}
      <AnimatePresence>
        {isRushOpen && (
          <MorningRush
            hasProfile={player.profile !== null}
            isCovered={isProfileOpen}
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
// 5. SUB-COMPONENTS (Clean code!)
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
// need to re-render when a new one is added
const SunRays = memo(function SunRays({ count }: { count: number }) {
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
          style={{ rotate: i * 5 , height: '150%', transformOrigin: 'center'}}
          className="absolute origin-center w-2 sm:w-3 bg-[#F9CB66] rounded-full"
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
          +{Math.floor(report.earned).toLocaleString()}
        </div>
        <p className="text-sm font-bold text-gray-600">times.</p>
        <PrimaryButton onClick={onClose} autoFocus>
          Clock In
        </PrimaryButton>
      </motion.div>
    </motion.div>
  );
}

// This extracts the messy HTML of the shop button into its own clean function.
// It receives data (props) from the main game and returns the UI.
function UpgradeButton({ upgrade, cost, owned, canAfford, onBuy }: any) {
  const Icon = upgrade.icon;
  
  return (
    <button
      onClick={onBuy}
      disabled={!canAfford}
      className={`group flex items-center justify-between p-3 sm:p-4 short:p-2 border-2 border-[#1A2E35] text-left transition-all touch-manipulation ${
        canAfford 
        ? 'bg-white hover:bg-[#F9CB66] shadow-[3px_3px_0px_0px_#1A2E35] hover:translate-y-[2px] hover:translate-x-[2px] cursor-pointer hover:shadow-none' 
        : 'bg-gray-100 opacity-70 cursor-not-allowed'
      }`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div className={`p-2 sm:p-3 short:p-1.5 border-2 border-[#1A2E35] shrink-0 ${canAfford ? 'bg-[#006b5b] text-white' : 'bg-gray-300 text-gray-600'}`}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div>
          <h3 className="font-bold text-sm sm:text-lg short:text-sm leading-tight">{upgrade.name}</h3>
          <p className="text-[10px] sm:text-xs font-bold text-gray-600">{upgrade.desc}</p>
          <p className={`text-xs sm:text-sm font-black mt-1 ${canAfford ? 'text-[#006b5b]' : 'text-red-500'}`}>
            Cost: {cost.toLocaleString()}
          </p>
        </div>
      </div>
      
      <div className="text-xl sm:text-3xl short:text-xl font-black text-gray-300 group-hover:text-[#1A2E35] transition-colors px-2">
        {owned}
      </div>
    </button>
  );
}