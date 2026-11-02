"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Montserrat } from 'next/font/google';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { ArrowLeft, AtSign, BarChart3, CircleHelp, Delete, Share2, Trophy } from 'lucide-react';
import { usePlayer, type Profile } from '@/lib/usePlayer';
import { formatDuration } from '@/lib/idle';
import {
  WORD_LENGTH, MAX_GUESSES, loadWordGame, submitWordGuess, fetchWordStats, fetchWordLeaderboard,
  buildWordShareText, keyboardMarks, secondsUntilNextWord,
  type WordGame, type WordStats, type WordLeaderboardRow, type Mark, type WordError,
} from '@/lib/morningWord';
import Modal from '../goodmorning/game/Modal';
import ProfileModal from '../goodmorning/game/ProfileModal';
import { PrimaryButton, SecondaryButton } from '../goodmorning/game/buttons';

const montserrat = Montserrat({ subsets: ['latin'] });

const HELP_SEEN_KEY = 'morning-word-help-seen';
const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const FLIP_SECONDS = 0.3; // Per tile; tiles in a row flip one after another

const MARK_STYLES: Record<Mark, string> = {
  G: 'bg-[#006b5b] border-[#006b5b] text-white',
  Y: 'bg-[#F9CB66] border-[#F9CB66] text-[#1A2E35]',
  B: 'bg-gray-400 border-gray-400 text-white',
};

const ERROR_MESSAGES: Record<WordError, string> = {
  not_a_word: 'Not in the word list',
  game_over: "You've already played today",
  no_word_today: "Today's word isn't ready yet",
  unavailable: "Couldn't reach the server. Try again.",
};

// 1:05, or 1:02:05 past an hour
const solveTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

const WIN_MESSAGES = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];

// Morning Word: guess the day's five-letter word in six tries. The server holds the answer and
// colors every guess, so everyone gets the same puzzle and nobody can peek.
export default function MorningWordPage() {
  const { profile, saveProfile, isReady } = usePlayer();
  const [game, setGame] = useState<WordGame | null>(null);
  const [loadError, setLoadError] = useState<WordError | null>(null);
  const [current, setCurrent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revealRow, setRevealRow] = useState<number | null>(null); // Row whose tiles are flipping
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<'help' | 'results' | 'profile' | null>(null);
  const rowShake = useAnimationControls();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((message: string, ms = 1800) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadWordGame().then((result) => {
      if (cancelled) return;
      if ('game' in result) {
        setGame(result.game);
        if (result.game.finished) setModal('results');
      } else {
        setLoadError(result.error);
      }
    });
    try {
      if (!localStorage.getItem(HELP_SEEN_KEY)) {
        setModal((m) => m ?? 'help');
        localStorage.setItem(HELP_SEEN_KEY, '1');
      }
    } catch {
      // Storage blocked: the help button still works
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const isLocked = !game || game.finished || isSubmitting || revealRow !== null;

  const submit = useCallback(async () => {
    if (isLocked || !game) return;
    if (current.length < WORD_LENGTH) {
      rowShake.start({ x: [0, -8, 8, -6, 6, 0], transition: { duration: 0.35 } });
      showToast('Not enough letters');
      return;
    }

    setIsSubmitting(true);
    const result = await submitWordGuess(current);
    setIsSubmitting(false);

    if ('error' in result) {
      rowShake.start({ x: [0, -8, 8, -6, 6, 0], transition: { duration: 0.35 } });
      showToast(ERROR_MESSAGES[result.error]);
      return;
    }

    const next = result.game;
    const row = next.guesses.length - 1;
    setGame(next);
    setCurrent('');
    setRevealRow(row);
    // Wait for the flip to finish before celebrating or showing results
    setTimeout(() => {
      setRevealRow(null);
      if (next.solved) showToast(WIN_MESSAGES[row] ?? 'Nice!', 2200);
      else if (next.finished) showToast(next.answer ?? '', 3000);
      if (next.finished) setTimeout(() => setModal('results'), 1600);
    }, FLIP_SECONDS * WORD_LENGTH * 1000 + 250);
  }, [isLocked, game, current, rowShake, showToast]);

  const press = useCallback((key: string) => {
    if (isLocked) return;
    if (key === 'ENTER') submit();
    else if (key === 'BACK') setCurrent((c) => c.slice(0, -1));
    else if (/^[A-Z]$/.test(key)) setCurrent((c) => (c.length < WORD_LENGTH ? c + key : c));
  }, [isLocked, submit]);

  // Physical keyboard, except while a popup (like the handle form) is open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (modal || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key === 'Enter' ? 'ENTER' : e.key === 'Backspace' ? 'BACK' : /^[a-z]$/i.test(e.key) ? e.key.toUpperCase() : null;
      if (!key) return;
      // Otherwise Enter also clicks whichever on-screen key was tapped last
      e.preventDefault();
      press(key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modal, press]);

  const handleSaveProfile = async (input: Profile) => {
    const error = await saveProfile(input);
    if (!error) setModal(game?.finished ? 'results' : null);
    return error;
  };

  const marks = game ? keyboardMarks(game) : {};
  // Hide the newest row's colors on the keyboard until its tiles have flipped
  const keyMarks = game && revealRow !== null ? keyboardMarks({ ...game, guesses: game.guesses.slice(0, -1), feedback: game.feedback.slice(0, -1) }) : marks;

  return (
    <main className={`fixed inset-0 flex flex-col bg-[#f4f7f5] text-[#1A2E35] ${montserrat.className} overflow-hidden`}>
      <header className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-white border-b-2 border-[#1A2E35]">
        <div className="flex items-center gap-1">
          <Link href="/goodmorning" aria-label="Back" className="p-2 hover:text-[#006b5b]">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <button onClick={() => setModal('help')} aria-label="How to play" className="p-2 hover:text-[#006b5b]">
            <CircleHelp className="w-6 h-6" />
          </button>
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-tighter text-center">
          Morning Word{game && <span className="text-[#006b5b]"> #{game.puzzleNumber}</span>}
        </h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setModal('results')} aria-label="Stats and leaderboard" className="p-2 hover:text-[#006b5b]">
            <BarChart3 className="w-6 h-6" />
          </button>
          {isReady && (
            <button
              onClick={() => setModal('profile')}
              aria-label={profile ? `Signed in as @${profile.handle}` : 'Claim your handle'}
              className={`p-2 border-2 border-[#1A2E35] ${profile ? 'bg-white' : 'bg-[#F9CB66]'} hover:bg-[#9FD085]`}
            >
              <AtSign className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      <div className="relative flex-1 min-h-0 flex items-center justify-center p-2">
        <AnimatePresence>
          {toast && (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-3 z-20 px-4 py-2 bg-[#1A2E35] text-white text-sm font-black uppercase tracking-wider pointer-events-none"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {loadError ? (
          <div className="max-w-xs p-5 bg-white border-2 border-[#1A2E35] shadow-[4px_4px_0px_0px_#1A2E35] text-center font-bold flex flex-col gap-3">
            <p>{ERROR_MESSAGES[loadError]}</p>
            <PrimaryButton onClick={() => window.location.reload()}>Try Again</PrimaryButton>
          </div>
        ) : (
          <Board game={game} current={current} revealRow={revealRow} rowShake={rowShake} />
        )}
      </div>

      <Keyboard marks={keyMarks} onPress={press} disabled={isLocked} />

      <AnimatePresence>
        {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
        {modal === 'results' && (
          <ResultsModal
            game={game}
            hasProfile={profile !== null}
            onClaimHandle={() => setModal('profile')}
            onClose={() => setModal(null)}
          />
        )}
        {modal === 'profile' && (
          <ProfileModal profile={profile} onSave={handleSaveProfile} onClose={() => setModal(null)} />
        )}
      </AnimatePresence>
    </main>
  );
}

function Board({ game, current, revealRow, rowShake }: {
  game: WordGame | null;
  current: string;
  revealRow: number | null;
  rowShake: ReturnType<typeof useAnimationControls>;
}) {
  const guesses = game?.guesses ?? [];
  const activeRow = game && !game.finished ? guesses.length : -1;

  return (
    // Sized to the space left over, so the keyboard never gets pushed off a short screen
    <div className="h-full max-h-[26rem] aspect-[5/6] max-w-full grid grid-rows-6 gap-1.5">
      {Array.from({ length: MAX_GUESSES }, (_, row) => {
        const word = row < guesses.length ? guesses[row] : row === activeRow ? current : '';
        return (
          <motion.div key={row} animate={row === activeRow ? rowShake : undefined} className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: WORD_LENGTH }, (_, i) => (
              <Tile
                key={i}
                letter={word[i] ?? ''}
                mark={row < guesses.length ? game!.feedback[row][i] : null}
                delay={row === revealRow ? i * FLIP_SECONDS : null}
              />
            ))}
          </motion.div>
        );
      })}
    </div>
  );
}

function Tile({ letter, mark, delay }: { letter: string; mark: Mark | null; delay: number | null }) {
  const [isRevealed, setIsRevealed] = useState(delay === null);

  // Flip in place: turn edge-on, swap to the color, turn back. Layout effect, so the new
  // colors never paint for a frame before the flip starts.
  useLayoutEffect(() => {
    if (delay === null) {
      setIsRevealed(true);
      return;
    }
    setIsRevealed(false);
    const timer = setTimeout(() => setIsRevealed(true), (delay + FLIP_SECONDS / 2) * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  const colored = mark && isRevealed;
  return (
    <motion.div
      animate={delay !== null ? { rotateX: [0, 90, 0] } : letter ? { scale: [1, 1.08, 1] } : {}}
      transition={delay !== null ? { duration: FLIP_SECONDS, delay } : { duration: 0.1 }}
      className={`flex items-center justify-center border-2 text-2xl sm:text-3xl font-black uppercase select-none ${
        colored ? MARK_STYLES[mark] : letter ? 'bg-white border-[#1A2E35]' : 'bg-white border-gray-300'
      }`}
    >
      {letter}
    </motion.div>
  );
}

function Keyboard({ marks, onPress, disabled }: { marks: Record<string, Mark>; onPress: (key: string) => void; disabled: boolean }) {
  return (
    <div className="shrink-0 w-full max-w-lg mx-auto px-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 flex flex-col gap-1.5">
      {KEY_ROWS.map((row, r) => (
        <div key={row} className="flex justify-center gap-1">
          {r === 2 && <Key label="Enter" wide onPress={() => onPress('ENTER')} disabled={disabled} />}
          {row.split('').map((letter) => (
            <Key key={letter} label={letter} mark={marks[letter]} onPress={() => onPress(letter)} disabled={disabled} />
          ))}
          {r === 2 && <Key label={<Delete className="w-5 h-5" />} ariaLabel="Delete" wide onPress={() => onPress('BACK')} disabled={disabled} />}
        </div>
      ))}
    </div>
  );
}

function Key({ label, ariaLabel, mark, wide = false, onPress, disabled }: {
  label: React.ReactNode;
  ariaLabel?: string;
  mark?: Mark;
  wide?: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${wide ? 'flex-[1.5] max-w-[4.5rem] text-[11px]' : 'flex-1 max-w-[3.25rem] text-sm'} h-12 sm:h-14 flex items-center justify-center border-2 font-black uppercase touch-manipulation select-none transition-colors disabled:cursor-default ${
        mark ? MARK_STYLES[mark] : 'bg-white border-[#1A2E35] hover:bg-[#fff8e6] active:bg-[#F9CB66]'
      }`}
    >
      {label}
    </button>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const example = (word: string, index: number, mark: Mark) => (
    <div className="grid grid-cols-5 gap-1 w-44">
      {word.split('').map((letter, i) => (
        <div key={i} className={`aspect-square flex items-center justify-center border-2 font-black ${i === index ? MARK_STYLES[mark] : 'bg-white border-[#1A2E35]'}`}>
          {letter}
        </div>
      ))}
    </div>
  );

  return (
    <Modal labelledBy="word-help-title" onClose={onClose} closeLabel="Close how to play" size="sm">
      <h2 id="word-help-title" className="text-2xl font-extrabold uppercase tracking-tighter">How to Play</h2>
      <ul className="text-sm font-bold flex flex-col gap-1 list-disc pl-5">
        <li>Guess today&apos;s 5-letter word in 6 tries.</li>
        <li>Each guess must be a real word.</li>
        <li>The tiles change color to show how close you were.</li>
      </ul>
      <div className="flex flex-col gap-3 text-xs font-bold">
        {example('BAGEL', 0, 'G')}
        <p><span className="font-black">B</span> is in the word, in the right spot.</p>
        {example('CIDER', 2, 'Y')}
        <p><span className="font-black">D</span> is in the word, in the wrong spot.</p>
        {example('HAVEN', 3, 'B')}
        <p><span className="font-black">E</span> isn&apos;t in the word.</p>
      </div>
      <p className="text-xs font-bold text-gray-500">
        A new word every day at midnight Central. Fewest guesses tops the leaderboard; ties go to whoever solved it fastest.
      </p>
      <PrimaryButton onClick={onClose} autoFocus>Let&apos;s Go</PrimaryButton>
    </Modal>
  );
}

function ResultsModal({ game, hasProfile, onClaimHandle, onClose }: {
  game: WordGame | null;
  hasProfile: boolean;
  onClaimHandle: () => void;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<WordStats | null>(null);
  const [board, setBoard] = useState<WordLeaderboardRow[] | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntilNextWord());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchWordStats().then(setStats);
    fetchWordLeaderboard().then(setBoard);
    const timer = setInterval(() => setSecondsLeft(secondsUntilNextWord()), 1000);
    return () => clearInterval(timer);
  }, []);

  const share = async () => {
    if (!game) return;
    const text = buildWordShareText(game, `${window.location.origin}/word`);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      // Share sheet dismissed
    }
  };

  const maxCount = Math.max(1, ...(stats?.distribution ?? []));
  const winningRow = game?.solved ? game.guesses.length - 1 : -1;

  return (
    <Modal labelledBy="word-results-title" onClose={onClose} closeLabel="Close results" size="sm">
      <h2 id="word-results-title" className="text-2xl font-extrabold uppercase tracking-tighter">
        {game?.finished ? (game.solved ? 'Solved!' : 'So Close') : 'Statistics'}
      </h2>

      {game?.finished && !game.solved && game.answer && (
        <p className="text-sm font-bold">The word was <span className="font-black text-[#006b5b]">{game.answer}</span>.</p>
      )}

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ['Played', stats?.played],
          ['Win %', stats && stats.played ? Math.round((stats.wins / stats.played) * 100) : stats ? 0 : undefined],
          ['Streak', stats?.currentStreak],
          ['Best', stats?.maxStreak],
        ].map(([label, value]) => (
          <div key={label as string}>
            <div className="text-2xl font-black">{value ?? '–'}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-black uppercase tracking-widest">Guesses</h3>
        {(stats?.distribution ?? [0, 0, 0, 0, 0, 0]).map((count, i) => (
          <div key={i} className="flex items-center gap-2 text-xs font-black">
            <span className="w-3">{i + 1}</span>
            <div
              className={`h-5 flex items-center justify-end px-1.5 text-white ${i === winningRow ? 'bg-[#006b5b]' : 'bg-gray-400'}`}
              style={{ width: `${Math.max(8, (count / maxCount) * 100)}%` }}
            >
              {count}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-1">
          <Trophy className="w-4 h-4 text-[#006b5b]" /> Today
        </h3>
        {board === null ? (
          <p className="text-xs font-bold text-gray-500">Loading…</p>
        ) : board.length === 0 ? (
          <p className="text-xs font-bold text-gray-500">No one has finished yet. Be the first.</p>
        ) : (
          <ol className="text-xs font-bold flex flex-col gap-0.5 max-h-40 overflow-y-auto">
            {board.map((row) => (
              <li key={row.rank} className={`flex justify-between px-2 py-1 ${row.isMe ? 'bg-[#fff8e6] border border-[#1A2E35]' : ''}`}>
                <span>#{row.rank} @{row.handle}</span>
                <span>{row.solved ? `${row.guesses}/6` : 'X/6'} · {solveTime(row.seconds)}</span>
              </li>
            ))}
          </ol>
        )}
        {!hasProfile && (
          <button onClick={onClaimHandle} className="mt-1 text-xs font-black text-[#006b5b] underline text-left">
            Claim a handle to get on the leaderboard →
          </button>
        )}
      </div>

      {game?.finished && (
        <>
          <p className="text-xs font-bold text-center text-gray-500">
            Next word in <span className="font-black text-[#1A2E35]">{formatDuration(secondsLeft)}</span>
          </p>
          <PrimaryButton onClick={share}>
            <Share2 className="w-5 h-5" /> {copied ? 'Copied!' : 'Share'}
          </PrimaryButton>
        </>
      )}
      <SecondaryButton onClick={onClose}>Close</SecondaryButton>
    </Modal>
  );
}
