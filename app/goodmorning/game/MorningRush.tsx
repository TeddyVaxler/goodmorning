"use client";

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { Timer, Trophy, X, AtSign } from 'lucide-react';
import {
  RUSH_SECONDS,
  RUSH_MAX_SCORE,
  RUSH_COUNTDOWN_SECONDS,
  startRush,
  submitRush,
  fetchMyRushStats,
  type RushStats,
} from '@/lib/rush';

type Phase = 'ready' | 'countdown' | 'playing' | 'submitting' | 'results' | 'error';

interface MorningRushProps {
  hasProfile: boolean;
  isCovered: boolean; // Another modal is open on top; it owns the Escape key
  onClaimHandle: () => void;
  onShowLeaderboard: () => void;
  onScoreSaved: () => void;
  onClose: () => void;
}

// Phases where closing would throw away a run in progress
const LOCKED_PHASES: Phase[] = ['countdown', 'playing', 'submitting'];

// A 30-second click sprint. The server starts the clock when the countdown begins and checks
// the timing and score on submit (see submit_rush in supabase/migrations).
// memo: the game page re-renders on every passive-income tick; these props are all stable.
export default memo(function MorningRush({ hasProfile, isCovered, onClaimHandle, onShowLeaderboard, onScoreSaved, onClose }: MorningRushProps) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [countdown, setCountdown] = useState(RUSH_COUNTDOWN_SECONDS);
  const [timeLeft, setTimeLeft] = useState(RUSH_SECONDS);
  const [score, setScore] = useState(0);
  const [stats, setStats] = useState<RushStats | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const scoreRef = useRef(0);
  const runIdRef = useRef<Promise<string | null> | null>(null);
  // The parent re-renders several times a second, so callbacks are read through a ref
  // instead of being effect dependencies (which would re-run the submit effect)
  const onScoreSavedRef = useRef(onScoreSaved);
  useEffect(() => {
    onScoreSavedRef.current = onScoreSaved;
  }, [onScoreSaved]);

  const isLocked = LOCKED_PHASES.includes(phase);

  const begin = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    setStats(null);
    setTimeLeft(RUSH_SECONDS);
    setCountdown(RUSH_COUNTDOWN_SECONDS);
    runIdRef.current = startRush(); // Runs during the countdown
    setPhase('countdown');
  }, []);

  // --- COUNTDOWN: 3, 2, 1, then play once the server has a run id ---
  useEffect(() => {
    if (phase !== 'countdown') return;
    let cancelled = false;
    const startedAt = performance.now();
    const interval = setInterval(async () => {
      const left = RUSH_COUNTDOWN_SECONDS - Math.floor((performance.now() - startedAt) / 1000);
      if (left > 0) {
        setCountdown(left);
        return;
      }
      clearInterval(interval);
      const runId = await runIdRef.current;
      if (cancelled) return;
      if (runId) {
        setPhase('playing');
      } else {
        setErrorMessage("Couldn't reach the leaderboard. Check your connection and try again.");
        setPhase('error');
      }
    }, 100);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase]);

  // --- PLAYING: 30 second clock ---
  useEffect(() => {
    if (phase !== 'playing') return;
    const endsAt = performance.now() + RUSH_SECONDS * 1000;
    const interval = setInterval(() => {
      const left = Math.max(0, (endsAt - performance.now()) / 1000);
      setTimeLeft(left);
      if (left === 0) {
        clearInterval(interval);
        setPhase('submitting');
      }
    }, 50);
    return () => clearInterval(interval);
  }, [phase]);

  // --- SUBMITTING ---
  useEffect(() => {
    if (phase !== 'submitting') return;
    let cancelled = false;
    (async () => {
      const runId = await runIdRef.current;
      const result = runId ? await submitRush(runId, Math.min(scoreRef.current, RUSH_MAX_SCORE)) : null;
      if (cancelled) return;
      if (!result) {
        setErrorMessage("Couldn't save your score. Try another round.");
        setPhase('error');
        return;
      }
      setStats(result);
      setPhase('results');
      onScoreSavedRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // A handle claimed from the results screen puts the player on the board: fetch their rank
  useEffect(() => {
    if (phase !== 'results' || !hasProfile || stats?.rankToday != null) return;
    let cancelled = false;
    fetchMyRushStats().then((fresh) => {
      if (!cancelled && fresh) setStats(fresh);
    });
    return () => {
      cancelled = true;
    };
  }, [phase, hasProfile, stats?.rankToday]);

  useEffect(() => {
    if (isLocked || isCovered) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLocked, isCovered, onClose]);

  const handleBossClick = () => {
    if (phase !== 'playing') return;
    scoreRef.current += 1;
    setScore(scoreRef.current);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A2E35]/70 p-4"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rush-title"
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative w-full max-w-md max-h-full overflow-y-auto flex flex-col items-center gap-4 p-6 bg-white border-2 border-[#1A2E35] text-center shadow-[8px_8px_0px_0px_#1A2E35]"
      >
        {!isLocked && (
          <button
            onClick={onClose}
            aria-label="Close Morning Rush"
            className="absolute top-3 right-3 p-1 text-[#1A2E35] hover:text-[#006b5b] touch-manipulation"
          >
            <X className="w-6 h-6" />
          </button>
        )}

        <h2 id="rush-title" className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tighter flex items-center gap-2">
          <Timer className="w-7 h-7 text-[#006b5b]" />
          Morning Rush
        </h2>

        {phase === 'ready' && (
          <>
            <p className="text-sm font-bold text-gray-600">
              Say good morning as many times as you can in {RUSH_SECONDS} seconds. Your best score each day goes on
              the leaderboard. Upgrades don&apos;t count: just you and your thumbs.
            </p>
            <p className="text-xs font-bold text-gray-500">Resets at midnight Central.</p>
            <PrimaryButton onClick={begin} autoFocus>Start</PrimaryButton>
          </>
        )}

        {phase === 'countdown' && (
          <motion.div
            key={countdown}
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="py-16 text-8xl font-black text-[#006b5b]"
          >
            {countdown}
          </motion.div>
        )}

        {(phase === 'playing' || phase === 'submitting') && (
          <>
            <div className="w-full flex items-center justify-between font-black">
              <span className="text-3xl tabular-nums">{Math.ceil(timeLeft)}s</span>
              <span className="text-5xl text-[#006b5b] tabular-nums">{score}</span>
            </div>
            <div className="w-full h-3 border-2 border-[#1A2E35] bg-gray-100">
              <div className="h-full bg-[#F9CB66]" style={{ width: `${(timeLeft / RUSH_SECONDS) * 100}%` }} />
            </div>
            <motion.button
              onClick={handleBossClick}
              // Holding Enter auto-repeats clicks; only fresh key presses count
              onKeyDown={(e) => e.repeat && e.preventDefault()}
              disabled={phase !== 'playing'}
              whileTap={{ scale: 0.92 }}
              aria-label="Say good morning"
              className="my-2 w-56 h-56 sm:w-64 sm:h-64 rounded-full border-4 border-[#1A2E35] bg-[#F5A800] overflow-hidden shadow-[4px_4px_0px_0px_#1A2E35] select-none touch-manipulation cursor-pointer disabled:cursor-wait"
            >
              <img src="/goodmorning.png" alt="" className="w-full h-full object-contain pointer-events-none select-none" draggable={false} />
            </motion.button>
            {phase === 'submitting' && <p className="text-sm font-bold text-gray-600">Saving your score...</p>}
          </>
        )}

        {phase === 'results' && stats && (
          <>
            <div>
              <p className="text-xs font-black tracking-widest uppercase text-gray-600">Your score</p>
              <div className="text-7xl font-black text-[#006b5b] tabular-nums">{score}</div>
            </div>
            <div className="w-full grid grid-cols-3 gap-2">
              <Stat label="Best today" value={stats.bestToday} />
              <Stat label="Rank today" value={stats.rankToday != null ? `#${stats.rankToday}` : '-'} />
              <Stat label="Best ever" value={stats.bestAllTime} />
            </div>

            {hasProfile ? (
              <PrimaryButton onClick={onShowLeaderboard}>
                <Trophy className="w-5 h-5" /> See Leaderboard
              </PrimaryButton>
            ) : (
              <>
                <p className="text-sm font-bold text-gray-600">Your score is saved. Claim a handle to show up on the leaderboard.</p>
                <PrimaryButton onClick={onClaimHandle}>
                  <AtSign className="w-5 h-5" /> Claim Your Handle
                </PrimaryButton>
              </>
            )}
            <SecondaryButton onClick={begin}>Play Again</SecondaryButton>
          </>
        )}

        {phase === 'error' && (
          <>
            <p role="alert" className="px-3 py-2 bg-red-50 border-2 border-red-500 text-red-700 text-sm font-bold">
              {errorMessage}
            </p>
            <PrimaryButton onClick={begin}>Try Again</PrimaryButton>
          </>
        )}
      </motion.div>
    </motion.div>
  );
});

function Stat({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="p-2 border-2 border-[#1A2E35] bg-[#f4f7f5]">
      <div className="text-[10px] font-black tracking-widest uppercase text-gray-600">{label}</div>
      <div className="text-xl font-black tabular-nums">{value ?? '-'}</div>
    </div>
  );
}

function PrimaryButton({ children, onClick, autoFocus }: { children: React.ReactNode; onClick: () => void; autoFocus?: boolean }) {
  return (
    <button
      onClick={onClick}
      autoFocus={autoFocus}
      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#006b5b] hover:bg-[#F9CB66] text-white hover:text-[#1A2E35] font-bold border-2 border-[#1A2E35] shadow-[3px_3px_0px_0px_#1A2E35] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-colors touch-manipulation"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-6 py-2 bg-white hover:bg-[#F9CB66] text-[#1A2E35] font-bold border-2 border-[#1A2E35] transition-colors touch-manipulation"
    >
      {children}
    </button>
  );
}
