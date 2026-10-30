"use client";

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { Timer, Trophy, X, AtSign, Share2, Flame } from 'lucide-react';
import {
  RUSH_SECONDS,
  RUSH_MAX_SCORE,
  RUSH_COUNTDOWN_SECONDS,
  startRush,
  submitRush,
  fetchMyRushStats,
  formatCentralTime,
  formatCentralDate,
  rushLabel,
  secondsUntilNextRush,
  rushTwist,
  buildShareText,
  type RushStats,
} from '@/lib/rush';
import { PrimaryButton, SecondaryButton } from './buttons';
import BossHat, { seasonFor } from './BossHat';
import { playTap, playMilestone, playMiss } from '@/lib/sfx';
import RushField from './RushField';

type Phase = 'loading' | 'ready' | 'countdown' | 'playing' | 'submitting' | 'done' | 'error';

interface MorningRushProps {
  hasProfile: boolean;
  isCovered: boolean; // Another modal is open on top; it owns the Escape key
  showHat: boolean; // The player's wardrobe setting for the seasonal hat
  onClaimHandle: () => void;
  onShowLeaderboard: () => void;
  onScoreSaved: () => void;
  onClose: () => void;
}

// Phases where closing would throw away a run in progress
const LOCKED_PHASES: Phase[] = ['countdown', 'playing', 'submitting'];
const SUBMIT_ATTEMPTS = 3;
const SUBMIT_RETRY_MS = 1500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A once-a-day, 30-second click sprint, like Wordle: one shot per player per Central day.
// The server starts the clock when the countdown begins and checks the timing and score on
// submit (see submit_rush in supabase/migrations).
// memo: the game page re-renders on every passive-income tick; these props are all stable.
export default memo(function MorningRush({ hasProfile, isCovered, showHat, onClaimHandle, onShowLeaderboard, onScoreSaved, onClose }: MorningRushProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [countdown, setCountdown] = useState(RUSH_COUNTDOWN_SECONDS);
  const [timeLeft, setTimeLeft] = useState(RUSH_SECONDS);
  const [score, setScore] = useState(0);
  const [stats, setStats] = useState<RushStats | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  // What "Try Again" does: re-send the finished run's score, or start over from the top
  const [retryAction, setRetryAction] = useState<'submit' | 'restart'>('restart');

  const scoreRef = useRef(0);
  const runRef = useRef<ReturnType<typeof startRush> | null>(null);
  // The parent re-renders several times a second, so callbacks are read through a ref
  // instead of being effect dependencies (which would re-run the submit effect)
  const onScoreSavedRef = useRef(onScoreSaved);
  useEffect(() => {
    onScoreSavedRef.current = onScoreSaved;
  }, [onScoreSaved]);

  const isLocked = LOCKED_PHASES.includes(phase);

  // --- LOADING: already played today? Show the result instead of a new run ---
  useEffect(() => {
    if (phase !== 'loading') return;
    let cancelled = false;
    fetchMyRushStats().then((fresh) => {
      if (cancelled) return;
      setStats(fresh);
      setPhase(fresh?.playedToday ? 'done' : 'ready');
    });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  const begin = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    setTimeLeft(RUSH_SECONDS);
    setCountdown(RUSH_COUNTDOWN_SECONDS);
    runRef.current = startRush(); // Runs during the countdown
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
      const run = await runRef.current;
      if (cancelled || !run) return;
      if ('runId' in run) {
        setTwist(rushTwist(run.day));
        setPhase('playing');
      } else if (run.error === 'already_played') {
        setPhase('loading'); // Shows today's result
      } else {
        setErrorMessage("Couldn't reach the leaderboard. Check your connection and try again.");
        setRetryAction('restart');
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

  // --- SUBMITTING: today's only attempt, so retry a flaky network a few times ---
  useEffect(() => {
    if (phase !== 'submitting') return;
    let cancelled = false;
    (async () => {
      const run = await runRef.current;
      if (!run || !('runId' in run)) return;
      let result = await submitRush(run.runId, Math.min(scoreRef.current, RUSH_MAX_SCORE));
      for (let attempt = 1; attempt < SUBMIT_ATTEMPTS && 'error' in result && result.error === 'network' && !cancelled; attempt++) {
        await wait(SUBMIT_RETRY_MS);
        result = await submitRush(run.runId, Math.min(scoreRef.current, RUSH_MAX_SCORE));
      }
      if (cancelled) return;
      if ('error' in result) {
        // The server keeps the run open for 2 minutes, so a network failure can still be re-sent
        setErrorMessage(result.error === 'network'
          ? "Couldn't save your score yet. Check your connection and try again; it's held for 2 minutes."
          : 'This run took too long to finish, so the score could not be counted.');
        setRetryAction(result.error === 'network' ? 'submit' : 'restart');
        setPhase('error');
        return;
      }
      setStats(result.stats);
      setPhase('done');
      onScoreSavedRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // A handle claimed from the results screen puts the player on the board: fetch their rank
  const needsRank = phase === 'done' && hasProfile && stats?.todayScore != null && stats.rankToday == null;
  useEffect(() => {
    if (!needsRank) return;
    let cancelled = false;
    fetchMyRushStats().then((fresh) => {
      if (!cancelled && fresh) setStats(fresh);
    });
    return () => {
      cancelled = true;
    };
  }, [needsRank]);

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
    // Pitch climbs every 50 taps, with a flourish at each 50
    if (scoreRef.current % 50 === 0) playMilestone();
    else playTap(Math.min(5, 1 + Math.floor(scoreRef.current / 50)));
  };

  // Decoy Wednesday: tapping an impostor costs 3
  const handleDecoy = () => {
    if (phase !== 'playing') return;
    scoreRef.current = Math.max(0, scoreRef.current - 3);
    setScore(scoreRef.current);
    playMiss();
  };

  // The ready screen previews today's twist from this device's clock; the run itself plays the
  // twist for the day the server filed it under (set when the run starts)
  const [twist, setTwist] = useState(() => rushTwist());

  // Seasonal hat on the Rush boss too (read once; the modal never stays open across seasons)
  const [currentSeason] = useState(() => seasonFor());
  const season = showHat ? currentSeason : null;

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
        className="relative w-full max-w-md max-h-full overflow-y-auto overscroll-contain flex flex-col items-center gap-4 p-5 sm:p-6 bg-white border-2 border-[#1A2E35] text-center shadow-[8px_8px_0px_0px_#1A2E35]"
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

        {phase === 'loading' && <p className="py-10 text-sm font-bold text-gray-500">Loading...</p>}

        {phase === 'ready' && (
          <>
            <div className="w-full p-3 border-2 border-[#1A2E35] bg-[#fff8e6] text-left">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Today&apos;s twist</p>
              <p className="text-lg font-black">{twist.name}</p>
              <p className="text-xs font-bold text-gray-600">{twist.description}</p>
            </div>
            {stats?.streakNeedsFreeze && (
              <p className="w-full px-3 py-2 border-2 border-[#1A2E35] bg-[#e0f2fe] text-xs font-bold text-left">
                🧊 You missed a day, but a streak freeze will save your {stats.currentStreak}-day streak when you play.
              </p>
            )}
            <ol className="w-full flex flex-col gap-2 text-left text-sm font-bold">
              <RuleStep n={1}>Tap the boss as many times as you can in {RUSH_SECONDS} seconds.</RuleStep>
              <RuleStep n={2}>You get <span className="text-[#006b5b]">one shot per day</span>. No retries, so make it count.</RuleStep>
              <RuleStep n={3}>Your score goes on today&apos;s leaderboard. Play daily to build a streak.</RuleStep>
            </ol>
            <p className="text-xs font-bold text-gray-500">Upgrades don&apos;t count. New Rush every day at midnight CT.</p>
            <PrimaryButton onClick={begin} autoFocus>Start Today&apos;s Rush</PrimaryButton>
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
            <RushField
              twist={twist}
              isPlaying={phase === 'playing'}
              timeLeft={timeLeft}
              season={season}
              onHit={handleBossClick}
              onDecoy={handleDecoy}
            />
            {phase === 'submitting' && <p className="text-sm font-bold text-gray-600">Saving your score...</p>}
          </>
        )}

        {phase === 'done' && stats && (
          <TodayResult
            stats={stats}
            hasProfile={hasProfile}
            onClaimHandle={onClaimHandle}
            onShowLeaderboard={onShowLeaderboard}
          />
        )}

        {phase === 'error' && (
          <>
            <p role="alert" className="px-3 py-2 bg-red-50 border-2 border-red-500 text-red-700 text-sm font-bold">
              {errorMessage}
            </p>
            {/* A restart re-calls start_rush, which hands back the same run if it was just created */}
            <PrimaryButton onClick={retryAction === 'submit' ? () => setPhase('submitting') : begin}>
              Try Again
            </PrimaryButton>
          </>
        )}
      </motion.div>
    </motion.div>
  );
});

// Today's score, when it was played (Central), rank, streak, sharing, and when the next Rush opens
function TodayResult({ stats, hasProfile, onClaimHandle, onShowLeaderboard }: {
  stats: RushStats;
  hasProfile: boolean;
  onClaimHandle: () => void;
  onShowLeaderboard: () => void;
}) {
  const [nextIn, setNextIn] = useState(() => secondsUntilNextRush());
  const [shareLabel, setShareLabel] = useState('Share');

  useEffect(() => {
    const interval = setInterval(() => setNextIn(secondsUntilNextRush()), 1000);
    return () => clearInterval(interval);
  }, []);

  const share = async () => {
    const text = buildShareText(stats, `${window.location.origin}/goodmorning/game`);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareLabel('Copied!');
    } catch {
      // Share sheet dismissed, or clipboard blocked: nothing to do
    }
  };

  const hours = Math.floor(nextIn / 3600);
  const minutes = Math.floor((nextIn % 3600) / 60);
  const seconds = nextIn % 60;

  return (
    <>
      <div>
        <p className="text-xs font-black tracking-widest uppercase text-gray-600">
          {rushLabel(stats.playedAt ?? undefined)}
          {stats.playedAt && <> · {formatCentralDate(stats.playedAt)}</>}
        </p>
        <div className="text-7xl font-black text-[#006b5b] tabular-nums">{stats.todayScore ?? '-'}</div>
        <p className="text-xs font-bold text-gray-600">
          {stats.todayScore == null
            ? "Today's run didn't finish. Your next shot is tomorrow."
            : <>good mornings{stats.playedAt && <> · played at {formatCentralTime(stats.playedAt)}</>}</>}
        </p>
      </div>

      <div className="w-full grid grid-cols-3 gap-2">
        <Stat label="Rank today" value={stats.rankToday != null ? `#${stats.rankToday}` : '-'} />
        <Stat label="Streak" value={stats.currentStreak} icon={stats.currentStreak > 1} />
        <Stat label="Best ever" value={stats.bestAllTime} />
      </div>

      {hasProfile ? (
        <PrimaryButton onClick={onShowLeaderboard}>
          <Trophy className="w-5 h-5" /> See Leaderboard
        </PrimaryButton>
      ) : (
        <div className="w-full flex flex-col gap-2 p-3 border-2 border-dashed border-[#1A2E35] bg-[#fff8e6]">
          <p className="text-sm font-bold">
            {stats.todayScore != null ? 'Your score is saved, but nobody can see it yet.' : 'Get on the board tomorrow.'}{' '}
            Claim a handle to show up on the leaderboard.
          </p>
          <PrimaryButton onClick={onClaimHandle}>
            <AtSign className="w-5 h-5" /> Claim Your Handle
          </PrimaryButton>
        </div>
      )}

      {stats.todayScore != null && (
        <SecondaryButton onClick={share}>
          <Share2 className="w-4 h-4" /> {shareLabel}
        </SecondaryButton>
      )}

      {stats.freezesAvailable > 0 && (
        <p className="text-xs font-bold text-gray-600">
          🧊 {stats.freezesAvailable} streak freeze{stats.freezesAvailable > 1 ? 's' : ''} banked: miss a day and your streak is safe.
        </p>
      )}

      <p className="text-xs font-black tracking-widest uppercase text-gray-500 tabular-nums">
        Next Rush in {hours}h {String(minutes).padStart(2, '0')}m {String(seconds).padStart(2, '0')}s
      </p>
    </>
  );
}

function RuleStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="shrink-0 w-6 h-6 flex items-center justify-center bg-[#F9CB66] border-2 border-[#1A2E35] text-xs font-black">{n}</span>
      <span>{children}</span>
    </li>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string | null; icon?: boolean }) {
  return (
    <div className="p-2 border-2 border-[#1A2E35] bg-[#f4f7f5]">
      <div className="text-[10px] font-black tracking-widest uppercase text-gray-600">{label}</div>
      <div className="text-xl font-black tabular-nums flex items-center justify-center gap-1">
        {icon && <Flame className="w-4 h-4 text-orange-500" />}
        {value ?? '-'}
      </div>
    </div>
  );
}
