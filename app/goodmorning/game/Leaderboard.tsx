"use client";

import { useState, useEffect, memo } from 'react';
import { Timer } from 'lucide-react';
import {
  fetchLeaderboard,
  fetchMyRushStats,
  type LeaderboardPeriod,
  type LeaderboardRow,
  type RushStats,
} from '@/lib/rush';

interface LeaderboardProps {
  refreshKey: number; // Bump to refetch, e.g. after a Rush or a handle change
  onPlayRush: () => void;
}

const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'all_time', label: 'All-time' },
];

// Top 10 Morning Rush scores by @handle, plus the viewer's own numbers.
// memo: the game page re-renders on every passive-income tick; these props are all stable.
export default memo(function Leaderboard({ refreshKey, onPlayRush }: LeaderboardProps) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('today');
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [myStats, setMyStats] = useState<RushStats | null>(null);
  const [hasFailed, setHasFailed] = useState(false);

  const changePeriod = (next: LeaderboardPeriod) => {
    if (next === period) return;
    setRows(null); // Different list: show loading. A plain refresh keeps the old rows until new ones land.
    setPeriod(next);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLeaderboard(period), fetchMyRushStats()]).then(([board, stats]) => {
      if (cancelled) return;
      setHasFailed(!board);
      setRows(board ?? []);
      setMyStats(stats);
    });
    return () => {
      cancelled = true;
    };
  }, [period, refreshKey]);

  const myBest = period === 'today' ? myStats?.bestToday : myStats?.bestAllTime;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex border-2 border-[#1A2E35]" role="tablist" aria-label="Leaderboard period">
        {PERIODS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={period === id}
            onClick={() => changePeriod(id)}
            className={`flex-1 py-2 text-xs sm:text-sm font-black uppercase tracking-widest transition-colors touch-manipulation ${
              period === id ? 'bg-[#1A2E35] text-white' : 'bg-white hover:bg-[#F9CB66]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {rows === null && <p className="py-6 text-center text-sm font-bold text-gray-500">Loading...</p>}

      {hasFailed && (
        <p className="py-6 text-center text-sm font-bold text-red-600">Couldn&apos;t load the leaderboard.</p>
      )}

      {rows && !hasFailed && rows.length === 0 && (
        <p className="py-6 text-center text-sm font-bold text-gray-500">
          No scores {period === 'today' ? 'yet today' : 'yet'}. Play a Morning Rush to take #1.
        </p>
      )}

      {rows && rows.length > 0 && (
        <ol className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.rank}
              className={`flex items-center gap-3 px-3 py-2 border-2 border-[#1A2E35] ${
                row.isMe ? 'bg-[#F9CB66]' : row.rank === 1 ? 'bg-[#fff8e6]' : 'bg-white'
              }`}
            >
              <span className="w-8 text-lg font-black tabular-nums">#{row.rank}</span>
              <span className="flex-1 min-w-0 truncate font-bold">
                @{row.handle}
                {row.isMe && <span className="ml-1 text-xs font-black text-[#006b5b]">(you)</span>}
              </span>
              <span className="text-lg font-black text-[#006b5b] tabular-nums">{row.score}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-1 flex items-center justify-between gap-3 p-3 border-2 border-dashed border-[#1A2E35] bg-[#f4f7f5]">
        <span className="text-xs sm:text-sm font-bold">
          {myBest != null ? (
            <>Your best {period === 'today' ? 'today' : 'ever'}: <span className="font-black text-[#006b5b]">{myBest}</span></>
          ) : (
            'No score yet'
          )}
        </span>
        <button
          onClick={onPlayRush}
          className="shrink-0 flex items-center gap-1 px-3 py-1 bg-[#006b5b] hover:bg-[#F9CB66] text-white hover:text-[#1A2E35] text-xs sm:text-sm font-bold border-2 border-[#1A2E35] transition-colors touch-manipulation"
        >
          <Timer className="w-4 h-4" /> Play Rush
        </button>
      </div>
    </div>
  );
});
