"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Coffee, Mail, CircleDot, Newspaper, Users, ArrowLeft, AtSign, Timer, Trophy, CircleHelp, Medal } from 'lucide-react';
import { Montserrat } from 'next/font/google';
import Link from 'next/link';
import { usePlayer, type Profile } from '@/lib/usePlayer';
import ProfileModal from './ProfileModal';
import MorningRush from './MorningRush';
import Leaderboard from './Leaderboard';
import Walkthrough, { WALKTHROUGH_SEEN_KEY } from './Walkthrough';
import { PrimaryButton } from './buttons';
import AchievementsList, { ACHIEVEMENTS, type AchievementContext } from './Achievements';

const montserrat = Montserrat({ subsets: ['latin'] });

// ==========================================
// 1. GAME DATA
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
const OFFLINE_CAP_SECONDS = 8 * 60 * 60; 
const WELCOME_BACK_MIN_SECONDS = 60; 

// ==========================================
// 2. TYPES
// ==========================================
type Inventory = Record<string, number>;

interface GameState {
  mornings: number;
  inventory: Inventory;
  unlockedAchievements: string[];
  manualClicks: number;
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

function checkAchievements(state: GameState): GameState {
  const mps = getMps(state.inventory);
  const context: AchievementContext = {
    mornings: state.mornings,
    inventory: state.inventory,
    unlockedAchievements: state.unlockedAchievements,
    mps,
    upgrades: UPGRADES,
    manualClicks: state.manualClicks
  };

  const unlocks = new Set(state.unlockedAchievements);
  const startSize = unlocks.size;

  for (const ach of ACHIEVEMENTS) {
    if (!unlocks.has(ach.id) && ach.checkUnlocked(context)) {
      unlocks.add(ach.id);
    }
  }

  if (unlocks.size > startSize) {
    return { ...state, unlockedAchievements: Array.from(unlocks) };
  }
  return state;
}

function parseSave(raw: string): SavedGame | null {
  try {
    const data = JSON.parse(raw);
    if (data?.version !== SAVE_VERSION || !isCount(data.mornings) || !isCount(data.savedAt)) return null;

    const inventory = { ...EMPTY_INVENTORY };
    for (const u of UPGRADES) {
      const owned = data.inventory?.[u.id];
      if (isCount(owned)) inventory[u.id] = Math.floor(owned);
    }
    
    const unlockedAchievements = Array.isArray(data.unlockedAchievements) 
      ? data.unlockedAchievements.filter((id: unknown) => typeof id === 'string') 
      : [];

    const manualClicks = isCount(data.manualClicks) ? Math.floor(data.manualClicks) : 0;

    return { mornings: data.mornings, inventory, unlockedAchievements, manualClicks, savedAt: data.savedAt };
  } catch {
    return null;
  }
}

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
  } catch {}
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
  const [game, setGame] = useState<GameState>({ mornings: 0, inventory: EMPTY_INVENTORY, unlockedAchievements: [], manualClicks: 0 });
  const [hasLoaded, setHasLoaded] = useState(false);
  const [offlineReport, setOfflineReport] = useState<OfflineReport | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  
  // Sun Rays State
  const [rayCount, setRayCount] = useState(0);
  const [raysActive, setRaysActive] = useState(false);
  const rayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rayResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRushOpen, setIsRushOpen] = useState(false);
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<'shop' | 'leaderboard' | 'achievements'>('shop');
  const [leaderboardVersion, setLeaderboardVersion] = useState(0);
  
  const [achievementToast, setAchievementToast] = useState<{ name: string; icon: string } | null>(null);
  const prevUnlocks = useRef(game.unlockedAchievements.length);

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
    } catch {}
  }, []);
  const claimHandleFromWalkthrough = useCallback(() => {
    closeWalkthrough();
    setIsProfileOpen(true);
  }, [closeWalkthrough]);
  const showLeaderboard = useCallback(() => {
    setIsRushOpen(false);
    setSidePanel('leaderboard');
  }, []);

  const clickerPanelRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const isAnyModalOpen = isRushOpen || isProfileOpen || isWalkthroughOpen || offlineReport !== null;
  
  useEffect(() => {
    for (const panel of [clickerPanelRef.current, sidePanelRef.current]) {
      if (panel) panel.inert = isAnyModalOpen;
    }
  }, [isAnyModalOpen]);

  useEffect(() => {
    return () => {
      if (rayTimeoutRef.current) clearTimeout(rayTimeoutRef.current);
      if (rayResetTimeoutRef.current) clearTimeout(rayResetTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!hasLoaded || !player.isReady || offlineReport) return;
    let hasSeen = true;
    try {
      hasSeen = localStorage.getItem(WALKTHROUGH_SEEN_KEY) !== null;
    } catch {}
    if (!hasSeen) setIsWalkthroughOpen(true);
  }, [hasLoaded, player.isReady, offlineReport]);

  const saveProfile = useCallback(async (input: Profile): Promise<string | null> => {
    const error = await savePlayerProfile(input);
    if (!error) refreshLeaderboard();
    return error;
  }, [savePlayerProfile, refreshLeaderboard]);
  
  const { mornings, inventory } = game;

  const clickPower = useMemo(() => getClickPower(inventory), [inventory]);
  const mps = useMemo(() => getMps(inventory), [inventory]);

  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    const save = loadSave();
    if (save) {
      const awaySeconds = Math.min(Math.max(0, (Date.now() - save.savedAt) / 1000), OFFLINE_CAP_SECONDS);
      const earned = getMps(save.inventory) * awaySeconds;
      
      setGame((prev) => checkAchievements({ 
        mornings: prev.mornings + save.mornings + earned, 
        inventory: save.inventory,
        unlockedAchievements: save.unlockedAchievements,
        manualClicks: prev.manualClicks
      }));
      
      if (awaySeconds >= WELCOME_BACK_MIN_SECONDS && earned >= 1) {
        setOfflineReport({ earned, seconds: awaySeconds });
      }
    }
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    const save = () => writeSave(gameRef.current);
    const saveIfHidden = () => {
      if (document.visibilityState === 'hidden') save();
    };
    const syncFromOtherTab = (e: StorageEvent) => {
      if (e.key !== SAVE_KEY || !e.newValue) return;
      const save = parseSave(e.newValue);
      if (save) setGame({ mornings: save.mornings, inventory: save.inventory, unlockedAchievements: save.unlockedAchievements, manualClicks: save.manualClicks });
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

  useEffect(() => {
    let lastTick = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const elapsedSeconds = Math.min((now - lastTick) / 1000, OFFLINE_CAP_SECONDS);
      lastTick = now;
      const earned = getMps(gameRef.current.inventory) * elapsedSeconds;
      if (earned > 0) setGame((prev) => checkAchievements({ ...prev, mornings: prev.mornings + earned }));
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (hasLoaded && game.unlockedAchievements.length > prevUnlocks.current) {
      const latestId = game.unlockedAchievements[game.unlockedAchievements.length - 1];
      const achievement = ACHIEVEMENTS.find(a => a.id === latestId);
      
      if (achievement) {
        setAchievementToast({ name: achievement.name, icon: achievement.icon });
        const timer = setTimeout(() => setAchievementToast(null), 4000);
        return () => clearTimeout(timer);
      }
    }
    prevUnlocks.current = game.unlockedAchievements.length;
  }, [game.unlockedAchievements, hasLoaded]);

  const handleBossClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setGame((prev) => checkAchievements({ 
    ...prev, 
    mornings: prev.mornings + clickPower,
    manualClicks: prev.manualClicks + 1 // <-- Increments by 1 per manual click
  }));
    // Add one ray per click (caps at 72 rays for a full circle)
    setRayCount((prev) => (prev < 72 ? prev + 1 : prev));
    setRaysActive(true);

    if (rayTimeoutRef.current) clearTimeout(rayTimeoutRef.current);
    if (rayResetTimeoutRef.current) clearTimeout(rayResetTimeoutRef.current);

    // Fade out after 5 seconds of inactivity
    rayTimeoutRef.current = setTimeout(() => {
      setRaysActive(false);
      rayResetTimeoutRef.current = setTimeout(() => {
        setRayCount(0);
      }, 2000); 
    }, 5000);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newParticle = { id: Date.now() + Math.random(), x, y, value: clickPower };
    setParticles((prev) => [...prev, newParticle].slice(-20));
  }, [clickPower]);

  const removeParticle = useCallback((id: number) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const buyUpgrade = useCallback((id: string, baseCost: number) => {
    setGame((prev) => {
      const cost = getCost(baseCost, prev.inventory[id]);
      if (prev.mornings < cost) return prev;
      return checkAchievements({
        ...prev,
        mornings: prev.mornings - cost,
        inventory: { ...prev.inventory, [id]: prev.inventory[id] + 1 },
      });
    });
  }, []);

  return (
    <main className={`fixed inset-0 overflow-hidden bg-[#f4f7f5] text-[#1A2E35] ${montserrat.className} p-3 sm:p-4 md:p-8 short:p-3 flex flex-col lg:flex-row short:flex-row gap-4 md:gap-8 short:gap-4 selection:bg-[#F9CB66]`}>

      {/* LEFT AREA: The Clicker Area */}
      <div ref={clickerPanelRef} className="shrink-0 lg:flex-1 lg:min-h-0 short:flex-1 short:min-h-0 min-w-0 flex flex-col items-center border-2 border-[#1A2E35] bg-white p-4 sm:p-6 short:p-3 shadow-[4px_4px_0px_0px_#1A2E35] sm:shadow-[8px_8px_0px_0px_#1A2E35] relative overflow-hidden">
        
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
              {!player.profile && (
                <span className="absolute -top-1.5 -right-1.5 flex w-3 h-3" aria-hidden="true">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-[#006b5b] opacity-75 animate-ping" />
                  <span className="relative inline-flex w-3 h-3 rounded-full bg-[#006b5b] border border-white" />
                </span>
              )}
            </button>
          </div>
        )}
        
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

        <div className="flex-1 min-h-0 w-full flex items-center justify-center mt-2 sm:mt-8 short:mt-1 z-10 relative">
          <div className="my-6 sm:my-8 short:my-3 relative w-[min(12rem,25dvh)] h-[min(12rem,25dvh)] sm:w-[min(16rem,30dvh)] sm:h-[min(16rem,30dvh)] md:w-[min(20rem,40dvh)] md:h-[min(20rem,40dvh)] short:w-[min(12rem,30dvh)] short:h-[min(12rem,30dvh)] touch-manipulation">
            
            <SunRays count={rayCount} isActive={raysActive} />

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

      {/* RIGHT AREA: Shop / Leaderboard / Awards */}
      <div ref={sidePanelRef} className="flex-1 min-h-0 min-w-0 lg:max-w-md short:max-w-[50%] w-full flex flex-col border-2 border-[#1A2E35] bg-white shadow-[4px_4px_0px_0px_#1A2E35] sm:shadow-[8px_8px_0px_0px_#1A2E35] overflow-hidden">
        
        {/* Panel Header */}
        <div className="shrink-0 pt-4 sm:pt-6 short:pt-3 text-center">
          <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tighter text-[#1A2E35]">
            Morning Routine
          </h2>
        </div>

        {/* Navigation Tabs */}
        <div className="shrink-0 mx-2 mt-3 sm:mx-6 sm:mt-4 short:mx-3 short:mt-2 border-b-4 border-[#1A2E35] pb-2">
          <div role="tablist" aria-label="Side panel" className="flex items-center justify-between w-full gap-1 sm:gap-2">
            <PanelTab isActive={sidePanel === 'shop'} onClick={() => setSidePanel('shop')}>
              <Sun className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-[#F9CB66] fill-current" /> Upgrades
            </PanelTab>
            {player.isEnabled && (
              <PanelTab isActive={sidePanel === 'leaderboard'} onClick={() => setSidePanel('leaderboard')}>
                <Trophy className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-[#F9CB66]" /> Leaderboard
              </PanelTab>
            )}
            <PanelTab isActive={sidePanel === 'achievements'} onClick={() => setSidePanel('achievements')}>
              <Medal className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-[#F9CB66]" /> Awards
            </PanelTab>
          </div>
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
            const cost = getCost(upgrade.baseCost, inventory[upgrade.id]);
            const canAfford = mornings >= cost;
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

          {sidePanel === 'achievements' && (
            <AchievementsList unlockedIds={game.unlockedAchievements} />
          )}
        </div>
      </div>

      <AnimatePresence>
        {achievementToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="flex items-center gap-3 bg-[#1A2E35] text-white px-5 py-3 rounded-full shadow-[0px_8px_16px_rgba(0,0,0,0.3)] border-2 border-[#F9CB66]">
              <span className="text-2xl">{achievementToast.icon}</span>
              <div className="flex flex-col">
                <span className="text-[10px] font-black tracking-widest text-[#F9CB66] uppercase">Achievement Unlocked</span>
                <span className="text-sm font-bold">{achievementToast.name}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {offlineReport && (
          <WelcomeBackModal report={offlineReport} onClose={() => setOfflineReport(null)} />
        )}
      </AnimatePresence>

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

      <AnimatePresence>
        {isProfileOpen && (
          <ProfileModal profile={player.profile} onSave={saveProfile} onClose={closeProfile} />
        )}
      </AnimatePresence>
    </main>
  );
}

// ==========================================
// 5. SUB-COMPONENTS
// ==========================================

function PanelTab({ isActive, onClick, children }: { isActive: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 sm:gap-2 text-[clamp(0.6rem,2vw,0.85rem)] sm:text-sm md:text-base short:text-xs font-extrabold uppercase tracking-tight transition-colors touch-manipulation ${
        isActive ? 'text-[#1A2E35]' : 'text-gray-400 hover:text-[#006b5b]'
      }`}
    >
      {children}
    </button>
  );
}

const SunRays = memo(function SunRays({ count, isActive }: { count: number; isActive: boolean }) {
  const isMax = count >= 72;
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ 
        rotate: 360,
        opacity: isActive && count > 0 ? 1 : 0 
      }}
      transition={{ 
        rotate: { duration: 30, repeat: Infinity, ease: "linear" },
        opacity: { duration: isActive ? 0 : 4, ease: "easeInOut" }
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ height: '0%', opacity: 0 }}
          animate={{ height: isActive ? (isMax ? '110%' : '75%') : '0%', opacity: 1 }}
          transition={{ 
            height: { duration: isActive ? 0.4 : 4.5, ease: "easeInOut" },}}
          style={{ rotate: i * 5, transformOrigin: 'bottom center' }}
          className="absolute bottom-1/2 w-2 sm:w-3 bg-[#F9CB66] rounded-full"
        />
      ))}
    </motion.div>
  );
});

function WelcomeBackModal({ report, onClose }: { report: OfflineReport; onClose: () => void }) {
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