import { supabase, ensureSession } from '@/lib/supabase';
import { secondsUntilNextRush } from '@/lib/rush';

// Must match submit_word_guess() in supabase/migrations
export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

// One letter's color: right spot, wrong spot, not in the word
export type Mark = 'G' | 'Y' | 'B';

export interface WordGame {
  day: string;
  puzzleNumber: number;
  guesses: string[];
  feedback: Mark[][]; // One row per guess
  solved: boolean;
  finished: boolean;
  answer: string | null; // Only sent once the game is over
  hardMode: boolean; // Hints must be used in later guesses
}

export interface WordStats {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  distribution: number[]; // Wins in 1..6 guesses
}

export interface WordLeaderboardRow {
  rank: number;
  handle: string;
  guesses: number;
  solved: boolean;
  seconds: number;
  isMe: boolean;
  hardMode: boolean;
}

interface WordGameRow {
  day: string;
  puzzle_number: number;
  guesses: string[];
  feedback: string[];
  solved: boolean;
  finished: boolean;
  answer: string | null;
  hard_mode: boolean;
}

// 'not_a_word', 'hard_mode' and the like are the player's to fix; 'unavailable' covers network
// and setup. 'hard_mode' comes with the hint the guess ignored, like "Letter 2 must be R".
export type WordError = 'not_a_word' | 'hard_mode' | 'already_guessing' | 'game_over' | 'no_word_today' | 'unavailable';
export type WordResult = { game: WordGame } | { error: WordError; detail?: string };

const toGame = (row: WordGameRow): WordGame => ({
  day: row.day,
  puzzleNumber: row.puzzle_number,
  guesses: row.guesses,
  feedback: row.feedback.map((marks) => marks.split('') as Mark[]),
  solved: row.solved,
  finished: row.finished,
  answer: row.answer,
  hardMode: row.hard_mode,
});

const KNOWN_ERRORS: WordError[] = ['not_a_word', 'hard_mode', 'already_guessing', 'game_over', 'no_word_today'];

function toError(message: string | undefined): { error: WordError; detail?: string } {
  const error = KNOWN_ERRORS.find((code) => message?.includes(code)) ?? 'unavailable';
  return error === 'hard_mode' ? { error, detail: message?.split('hard_mode:')[1]?.trim() } : { error };
}

async function call(rpc: string, args?: Record<string, unknown>): Promise<WordResult> {
  const client = supabase;
  if (!client || !(await ensureSession(client))) return { error: 'unavailable' };
  try {
    const { data, error } = await client.rpc(rpc, args);
    if (error) return toError(error.message);
    const row = (data as WordGameRow[] | null)?.[0];
    return row ? { game: toGame(row) } : { error: 'unavailable' };
  } catch {
    return { error: 'unavailable' };
  }
}

// Today's puzzle; opening it starts the player's clock for the leaderboard
export const loadWordGame = () => call('my_word_game');

export const submitWordGuess = (guess: string) => call('submit_word_guess', { guess });

// Only allowed before the first guess of the day
export const setWordHardMode = (enabled: boolean) => call('set_word_hard_mode', { enabled });

export async function fetchWordStats(): Promise<WordStats | null> {
  const client = supabase;
  if (!client) return null;
  const { data, error } = await client.rpc('my_word_stats');
  const row = data?.[0];
  if (error || !row) return null;
  return {
    played: row.played,
    wins: row.wins,
    currentStreak: row.current_streak,
    maxStreak: row.max_streak,
    distribution: row.distribution,
  };
}

export async function fetchWordLeaderboard(): Promise<WordLeaderboardRow[] | null> {
  const client = supabase;
  if (!client) return null;
  const { data, error } = await client.rpc('get_word_leaderboard');
  if (error || !data) return null;
  return data.map((row: { rank: number; handle: string; guesses: number; solved: boolean; seconds: number; is_me: boolean; hard_mode: boolean }) => ({
    rank: row.rank,
    handle: row.handle,
    guesses: row.guesses,
    solved: row.solved,
    seconds: row.seconds,
    isMe: row.is_me,
    hardMode: row.hard_mode,
  }));
}

// The puzzle rolls over with the Rush, at midnight Central
export const secondsUntilNextWord = secondsUntilNextRush;

const SQUARES: Record<Mark, string> = { G: '🟩', Y: '🟨', B: '⬛' };

// Spoiler-free result grid, like "Morning Word #3 4/6" ("4/6*" on hard mode)
export function buildWordShareText(game: WordGame, url: string) {
  const score = `${game.solved ? game.guesses.length : 'X'}/${MAX_GUESSES}${game.hardMode ? '*' : ''}`;
  return [
    `Morning Word #${game.puzzleNumber} ${score}`,
    '',
    ...game.feedback.map((marks) => marks.map((m) => SQUARES[m]).join('')),
    '',
    url,
  ].join('\n');
}

// Best known color per letter, for the on-screen keyboard (green beats yellow beats gray)
export function keyboardMarks(game: WordGame) {
  const rank: Record<Mark, number> = { G: 3, Y: 2, B: 1 };
  const marks: Record<string, Mark> = {};
  game.guesses.forEach((guess, row) => {
    guess.split('').forEach((letter, i) => {
      const mark = game.feedback[row][i];
      if (!marks[letter] || rank[mark] > rank[marks[letter]]) marks[letter] = mark;
    });
  });
  return marks;
}
