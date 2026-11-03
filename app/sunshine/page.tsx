"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { usePlayer, type Profile } from '@/lib/usePlayer';
import { Montserrat } from 'next/font/google';
import { Trophy, Info, Sun, AlertCircle, AtSign, ArrowLeft } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Leaderboard from './Leaderboard';
import ProfileModal from '../goodmorning/game/ProfileModal';
import { generateBoard, targetWords, scoreWord, decodeRings, type SunshineBoard } from '@/lib/sunshine';

const montserrat = Montserrat({ subsets: ['latin'] });

const FALLBACK_WORDS = [
  "EERIE", "GOUDA", "WAVY", "EARL", "HAVE", "SUNNY", "SOLAR", "LIGHT", "SHINE", "WARM",
  "GOLD", "BEAM", "RAYON", "BRIGHT", "CLEAR", "DAWN", "BLOOM", "SUMMER", "EARTH",
  "ORBIT", "PLANET", "STAR", "YELLOW", "GREEN", "WHITE", "MORNING", "CHIPS",
  "STONE", "WATER", "RIVER", "OCEAN", "CLOUD", "STORM", "FROST", "BREEZE",
  "PLANT", "FLOWER", "GRASS", "TREES", "LEAFS", "LEAFY", "FRUIT", "APPLE",
  "PEACH", "BERRY", "LEMON", "HONEY", "SWEET", "BREAD", "CHEESE", "TOAST",
  "CLEAN", "SHARP", "SMART", "ROUND", "SQUARE", "CLOCK", "SPACE", "POINT",
  "TRACK", "SPEED", "TRAIN", "POWER", "NIGHT", "DREAM", "SLEEP", "AWAKE"
];

const RING_RADII = [52, 86, 120, 154, 188, 222];
const BOARD_SIZE = 500;
const CENTER = BOARD_SIZE / 2;
const STROKE_WIDTH = 34;

const getCSTDate = (date: Date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

export default function SunriseGame() {
  const [hasMounted, setHasMounted] = useState(false);
  const { profile, saveProfile, isEnabled, isReady } = usePlayer();
  const todayCST = getCSTDate();

  // --- State ---
  const [selectedDate, setSelectedDate] = useState(todayCST);
  const [dictionary, setDictionary] = useState<Set<string>>(new Set(FALLBACK_WORDS));
  const [validTargets, setValidTargets] = useState<string[]>(FALLBACK_WORDS);
  const [isDictionaryLoaded, setIsDictionaryLoaded] = useState(false);

  const [boardState, setBoardState] = useState<(string | null)[][]>([]);
  const [visualAngles, setVisualAngles] = useState<number[]>([0, 0, 0, 0, 0, 0]);

  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [localScore, setLocalScore] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [rejectedWords, setRejectedWords] = useState<string[]>([]); // Found here, turned down by the server
  const [errorMessage, setErrorMessage] = useState("");

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [highlightedRays, setHighlightedRays] = useState<{ radIndex: number; minR: number; maxR: number }[]>([]);

  const svgRef = useRef<SVGSVGElement>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const interactionRef = useRef({ activeRing: null as number | null, startPointerAngle: 0, startVisualAngle: 0 });

  const isHistoricalDate = selectedDate !== todayCST;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // 1. Load Local Custom Dictionary
  useEffect(() => {
    let isMounted = true;
    async function loadCustomDictionary() {
      try {
        const res = await fetch('/custom-dictionary.json');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: /custom-dictionary.json not found in public folder`);
        }

        const words = targetWords(await res.json());

        console.log(`[Sunrise] Loaded ${words.length} words from /custom-dictionary.json`);

        if (isMounted) {
          setDictionary(new Set(words));
          setValidTargets(words);
          setIsDictionaryLoaded(true);
        }
      } catch (err) {
        console.error('[Sunrise] Failed to load /custom-dictionary.json:', err);
        if (isMounted) {
          setErrorMessage('Could not load custom-dictionary.json. Using fallback list.');
          setIsDictionaryLoaded(true);
        }
      }
    }
    loadCustomDictionary();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Load Player History
  useEffect(() => {
    async function loadHistory() {
      if (!profile || !supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('sunrise_scores')
        .select('*')
        .eq('player_id', user.id)
        .eq('game_date', selectedDate)
        .single();

      if (data) {
        setFoundWords(data.found_word_list || []);
        setLocalScore(data.score || 0);
      } else {
        setFoundWords([]);
        setLocalScore(0);
      }
    }
    loadHistory();
  }, [profile, selectedDate]);

  // 3. Load the day's board. The server's copy is what scores are checked against;
  // generating it locally is only a fallback for when there's no database to ask.
  const [serverBoard, setServerBoard] = useState<{ date: string; board: SunshineBoard | null } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadBoard() {
      if (!supabase) {
        setServerBoard({ date: selectedDate, board: null });
        return;
      }
      const { data, error } = await supabase
        .from('sunrise_boards')
        .select('rings, angles')
        .eq('game_date', selectedDate)
        .maybeSingle();
      if (!isMounted) return;
      if (error) {
        setErrorMessage("Couldn't load today's board. Words may not count until you reload.");
      }
      setServerBoard({ date: selectedDate, board: data ? { rings: decodeRings(data.rings), angles: data.angles } : null });
    }
    loadBoard();
    return () => {
      isMounted = false;
    };
  }, [selectedDate]);

  useEffect(() => {
    if (serverBoard?.date !== selectedDate) return;
    const board = serverBoard.board ?? (isDictionaryLoaded ? generateBoard(selectedDate, validTargets) : null);
    if (!board) return;
    setBoardState(board.rings);
    setVisualAngles(board.angles);
  }, [serverBoard, selectedDate, validTargets, isDictionaryLoaded]);

  // --- Interaction Handlers ---
  const getPointerAngleAndDistance = (e: React.PointerEvent) => {
    if (!svgRef.current) return { angle: 0, distance: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = BOARD_SIZE / rect.width;
    const scaleY = BOARD_SIZE / rect.height;

    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const dx = px - CENTER;
    const dy = py - CENTER;

    return {
      angle: Math.atan2(dy, dx) * (180 / Math.PI),
      distance: Math.hypot(dx, dy)
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isHistoricalDate) return;
    const { angle, distance } = getPointerAngleAndDistance(e);
    let ring = -1;

    if (distance >= 35 && distance <= 69) ring = 0;
    else if (distance >= 70 && distance <= 103) ring = 1;
    else if (distance >= 104 && distance <= 137) ring = 2;
    else if (distance >= 138 && distance <= 171) ring = 3;
    else if (distance >= 172 && distance <= 205) ring = 4;

    if (ring >= 0 && ring <= 4) {
      interactionRef.current = { activeRing: ring, startPointerAngle: angle, startVisualAngle: visualAngles[ring] };
      if (svgRef.current) svgRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const { activeRing, startPointerAngle, startVisualAngle } = interactionRef.current;
    if (activeRing === null || isHistoricalDate) return;

    const { angle: currentPointerAngle } = getPointerAngleAndDistance(e);
    let delta = currentPointerAngle - startPointerAngle;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;

    setVisualAngles((prev) => {
      const next = [...prev];
      next[activeRing] = startVisualAngle + delta;
      return next;
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const { activeRing } = interactionRef.current;
    if (activeRing === null) return;
    if (svgRef.current) svgRef.current.releasePointerCapture(e.pointerId);

    setVisualAngles((prev) => {
      const next = [...prev];
      let steps = Math.round(next[activeRing] / 30);
      next[activeRing] = steps * 30;
      return next;
    });
    interactionRef.current.activeRing = null;
  };

  // --- Validation ---
  const handleSubmit = async () => {
    if (isHistoricalDate || boardState.length === 0 || isSaving) return;
    if (getCSTDate() !== selectedDate) {
      setErrorMessage("It's a new day! Reload for today's board.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    type Candidate = { word: string; tiles: string[]; score: number; length: number; radIndex: number; minR: number; maxR: number; };
    let candidates: Candidate[] = [];

    for (let rad = 0; rad < 12; rad++) {
      let spoke = [];
      for (let r = 0; r < 6; r++) {
        const shiftSteps = Math.round(visualAngles[r] / 30);
        const origSlot = (rad - shiftSteps + 1200) % 12;
        const char = boardState[r][origSlot];
        spoke.push(char ? { r, origSlot, char, id: `r${r}s${origSlot}` } : null);
      }

      let segments = [];
      let currentSegment = [];
      for (let i = 0; i < spoke.length; i++) {
        if (spoke[i] !== null) {
          currentSegment.push(spoke[i]!);
        } else {
          if (currentSegment.length >= 4) segments.push(currentSegment);
          currentSegment = [];
        }
      }
      if (currentSegment.length >= 4) segments.push(currentSegment);

      segments.forEach((seg) => {
        const n = seg.length;
        for (let len = 4; len <= Math.min(6, n); len++) {
          for (let start = 0; start <= n - len; start++) {
            const slice = seg.slice(start, start + len);
            const tileIds = slice.map((t) => t.id);

            const rVals = slice.map((t) => t.r);
            const minR = Math.min(...rVals.map((r) => RING_RADII[r]));
            const maxR = Math.max(...rVals.map((r) => RING_RADII[r]));

            const wordOut = slice.map((t) => t.char).join('');
            if (dictionary.has(wordOut)) {
              candidates.push({
                word: wordOut,
                tiles: tileIds,
                length: len,
                score: scoreWord(wordOut),
                radIndex: rad,
                minR,
                maxR
              });
            }

            const wordIn = [...slice].reverse().map((t) => t.char).join('');
            if (dictionary.has(wordIn)) {
              candidates.push({
                word: wordIn,
                tiles: tileIds,
                length: len,
                score: scoreWord(wordIn),
                radIndex: rad,
                minR,
                maxR
              });
            }
          }
        }
      });
    }

    candidates.sort((a, b) => b.length - a.length || b.score - a.score);

    const newlyValidated: string[] = [];
    const newRays: { radIndex: number; minR: number; maxR: number }[] = [];
    let turnScore = 0;

    for (const cand of candidates) {
      if (!foundWords.includes(cand.word) && !newlyValidated.includes(cand.word) && !rejectedWords.includes(cand.word)) {
        newlyValidated.push(cand.word);
        newRays.push({ radIndex: cand.radIndex, minR: cand.minR, maxR: cand.maxR });
        turnScore += cand.score;
      }
    }

    if (newlyValidated.length > 0) {
      let cumulativeWords = [...foundWords, ...newlyValidated];
      let newScore = localScore + turnScore;

      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      setHighlightedRays(newRays);
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedRays([]);
      }, 3000);

      let dbFailed = false;

      if (supabase && profile) {
        // The server re-checks every word against the board and returns the official tally
        const { data, error } = await supabase.rpc('submit_sunrise_score', {
          submitted_words: cumulativeWords
        });

        if (!error && data?.[0]) {
          const counted: string[] = data[0].words;
          const turnedDown = newlyValidated.filter((w) => !counted.includes(w));
          if (turnedDown.length > 0) {
            setRejectedWords((prev) => [...prev, ...turnedDown]);
            setErrorMessage(`Didn't count: ${turnedDown.join(', ')}`);
            setTimeout(() => setErrorMessage(""), 4000);
          }
          cumulativeWords = counted;
          newScore = data[0].score;
        } else if (error) {
          console.error("Supabase sync failed:", error);
          dbFailed = true;
        }
      } else {
        dbFailed = true;
      }

      if (dbFailed) {
        if (!supabase) {
          setErrorMessage("Database disconnected. Score saved locally.");
        } else if (!profile) {
          setErrorMessage("Claim a handle to join the leaderboard! Score saved locally.");
        } else {
          setErrorMessage("Failed to sync with the server. Score saved locally.");
        }
        setTimeout(() => setErrorMessage(""), 4000);
      }

      setFoundWords(cumulativeWords);
      setLocalScore(newScore);
    } else {
      setErrorMessage("No new valid words found on this alignment.");
      setTimeout(() => setErrorMessage(""), 3000);
    }

    setIsSaving(false);
  };

  const handleSaveProfile = async (input: Profile) => {
    const error = await saveProfile(input);
    if (!error) setIsProfileOpen(false);
    return error;
  };

  if (!hasMounted) {
    return (
      <div className={`min-h-screen bg-page text-ink p-4 lg:p-8 ${montserrat.className} flex items-center justify-center`} suppressHydrationWarning>
        <div className="text-sm font-bold tracking-widest uppercase bg-paper border-2 border-line p-6 shadow-[4px_4px_0_0_rgb(var(--line))]">
          Loading Sunrise...
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-page text-ink p-4 lg:p-8 ${montserrat.className} touch-pan-y selection:bg-sun selection:text-night`} suppressHydrationWarning>
      <header className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <Link
            href="/goodmorning"
            aria-label="Back to Good Morning"
            className="flex items-center gap-2 px-3 sm:px-4 py-3 bg-paper hover:bg-sun text-ink font-black border-2 border-line shadow-[4px_4px_0_0_rgb(var(--line))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-colors uppercase tracking-widest text-sm touch-manipulation"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
            <span className="hidden sm:inline">Back</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black tracking-widest bg-sun text-ink px-6 py-3 border-2 border-line shadow-[4px_4px_0_0_rgb(var(--line))] uppercase flex items-center gap-3">
            <Sun className="w-8 h-8 text-ink" />
            SUNRISE
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {isReady && isEnabled && (
            <button
              onClick={() => setIsProfileOpen(true)}
              className="relative w-full sm:w-auto flex items-center justify-center gap-1 px-4 py-3 border-2 border-line bg-sun hover:bg-paper text-ink text-sm font-black shadow-[4px_4px_0px_0px_rgb(var(--line))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-colors touch-manipulation uppercase tracking-widest"
            >
              <AtSign className="w-4 h-4 shrink-0" />
              <span className="max-w-[10rem] truncate">
                {profile ? profile.handle : 'Claim Handle'}
              </span>
              {!profile && (
                <span className="absolute -top-1.5 -right-1.5 flex w-3 h-3">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-teal opacity-75 animate-ping" />
                  <span className="relative inline-flex w-3 h-3 rounded-full bg-teal border border-white" />
                </span>
              )}
            </button>
          )}
          <input
            type="date"
            max={todayCST}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full sm:w-auto bg-paper text-ink border-2 border-line p-3 uppercase font-bold focus:outline-none shadow-[4px_4px_0_0_rgb(var(--line))]"
          />
        </div>
      </header>

      <div className="flex flex-col xl:flex-row gap-8 max-w-6xl mx-auto">
        {/* LEFT COLUMN: Board */}
        <div className="flex-1 bg-paper border-2 border-line p-4 sm:p-8 relative shadow-[6px_6px_0_0_rgb(var(--line))] flex flex-col items-center">
          <div className="w-full max-w-[500px] aspect-square bg-page border-2 border-line flex items-center justify-center overflow-hidden touch-none select-none relative mb-6">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
              className={`w-full h-full overflow-visible drop-shadow-md ${isHistoricalDate ? '' : 'cursor-grab active:cursor-grabbing'}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {/* Tracks */}
              {RING_RADII.map((r, idx) => (
                <g key={`track-${idx}`}>
                  <circle cx={CENTER} cy={CENTER} r={r} fill="none" strokeWidth={STROKE_WIDTH} className={`pointer-events-none ${idx === 5 ? "stroke-teal" : "stroke-paper"}`} />
                  <circle cx={CENTER} cy={CENTER} r={r - STROKE_WIDTH / 2} fill="none" strokeWidth="2" className="pointer-events-none stroke-line" />
                  <circle cx={CENTER} cy={CENTER} r={r + STROKE_WIDTH / 2} fill="none" strokeWidth="2" className="pointer-events-none stroke-line" />
                </g>
              ))}

              {/* Highlights */}
              {highlightedRays.map((ray, i) => {
                const angleRad = (ray.radIndex * 30) * (Math.PI / 180);
                const startRadius = ray.minR - (STROKE_WIDTH / 2) + 2;
                const endRadius = ray.maxR + (STROKE_WIDTH / 2) - 2;

                const x1 = CENTER + startRadius * Math.cos(angleRad);
                const y1 = CENTER + startRadius * Math.sin(angleRad);
                const x2 = CENTER + endRadius * Math.cos(angleRad);
                const y2 = CENTER + endRadius * Math.sin(angleRad);

                return (
                  <line
                    key={`ray-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#F9CB66"
                    strokeWidth={STROKE_WIDTH - 4}
                    strokeLinecap="butt"
                    className="pointer-events-none opacity-80"
                  />
                );
              })}

              <circle cx={CENTER} cy={CENTER} r={23} strokeWidth="2" className="pointer-events-none fill-sun stroke-line" />

              {/* Letters */}
              {boardState.map((ringArr, r) => {
                const radius = RING_RADII[r];
                const ringAngle = visualAngles[r];

                return ringArr.map((char, s) => {
                  const finalAngleRad = ((s * 30) + ringAngle) * (Math.PI / 180);
                  const cx = CENTER + radius * Math.cos(finalAngleRad);
                  const cy = CENTER + radius * Math.sin(finalAngleRad);

                  if (r === 0 && s % 2 !== 0) {
                    return <circle key={`dot-${s}`} cx={cx} cy={cy} r="3" fill="#9ca3af" className="pointer-events-none" />;
                  }
                  if (!char) return null;

                  return (
                    <text
                      key={`r${r}s${s}`}
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className={`font-mono select-none ${r === 5 ? "fill-white" : "fill-ink"}`}
                      fontSize="19"
                      fontWeight="900"
                      pointerEvents="none"
                    >
                      {char}
                    </text>
                  );
                });
              })}
            </svg>
          </div>

          <div className="w-full max-w-[500px] p-4 border-2 border-line bg-cream flex items-start gap-3 mb-4">
            <Info className="w-6 h-6 flex-shrink-0 text-teal" />
            <div className="text-xs font-bold uppercase tracking-wider leading-relaxed text-ink">
              Rotate the inner rings to align words (4-6 letters) radially. Find new words and click submit to add them to your daily score!
            </div>
          </div>

          {/* Mobile Submit Button */}
          <div className="w-full max-w-[500px] xl:hidden flex flex-col gap-3">
            {errorMessage && (
              <div className="p-3 border-2 border-red-600 bg-red-50 flex items-start gap-2 text-left">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                <span className="text-sm font-bold text-red-700">{errorMessage}</span>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={isHistoricalDate || isSaving}
              className={`w-full p-4 text-lg sm:text-xl font-black border-2 border-line transition-all uppercase tracking-widest ${
                isHistoricalDate
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed shadow-none'
                  : 'bg-teal text-white hover:bg-sun hover:text-ink shadow-[4px_4px_0_0_rgb(var(--line))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer'
              }`}
            >
              {isHistoricalDate ? 'PRACTICE (UNSCORED)' : isSaving ? 'SAVING...' : 'SUBMIT ALIGNMENT'}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="w-full xl:w-96 flex flex-col gap-8">
          <div className="border-2 border-line p-6 bg-paper shadow-[6px_6px_0_0_rgb(var(--line))]">
            <h2 className="text-ink mb-4 font-black tracking-wider flex items-center gap-2 uppercase">
              <Trophy className="w-5 h-5 text-teal" /> FOUND WORDS ({foundWords.length})
            </h2>
            <div className="text-3xl mb-6 text-ink font-black">
              SCORE: <span className="text-teal">{localScore}</span>
            </div>
            <div className="flex flex-wrap gap-2 max-h-[280px] overflow-y-auto overscroll-contain">
              {foundWords.length === 0 ? (
                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2">
                  No words submitted yet today.
                </div>
              ) : (
                foundWords.map((w) => (
                  <span key={w} className="bg-paper text-ink px-3 py-1 font-bold border-2 border-line">
                    {w}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Desktop Submit Button */}
          <div className="hidden xl:flex flex-col gap-3">
            {errorMessage && (
              <div className="p-3 border-2 border-red-600 bg-red-50 flex items-start gap-2 text-left">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                <span className="text-sm font-bold text-red-700">{errorMessage}</span>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={isHistoricalDate || isSaving}
              className={`w-full p-4 text-xl font-black border-2 border-line transition-all uppercase tracking-widest ${
                isHistoricalDate
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed shadow-none'
                  : 'bg-teal text-white hover:bg-sun hover:text-ink shadow-[4px_4px_0_0_rgb(var(--line))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer'
              }`}
            >
              {isHistoricalDate ? 'PRACTICE (UNSCORED)' : isSaving ? 'SAVING...' : 'SUBMIT ALIGNMENT'}
            </button>
          </div>

          <Leaderboard selectedDate={selectedDate} />
        </div>
      </div>

      <AnimatePresence>
        {isProfileOpen && (
          <ProfileModal profile={profile} onSave={handleSaveProfile} onClose={() => setIsProfileOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}