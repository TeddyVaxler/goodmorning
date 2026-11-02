// Sunshine board generation and scoring, shared by the game and scripts/seed-sunshine.ts.
// The server stores each day's board (sunrise_boards) and checks submitted words against it,
// so this file must stay free of '@/' imports: the seed script runs it directly with node.

export const RING_COUNT = 6;
export const SLOT_COUNT = 12;

// rings[r][s] is the letter in ring r (0 = innermost), slot s; null where ring 0 has no tile
export interface SunshineBoard {
  rings: (string | null)[][];
  angles: number[]; // Starting rotation of each ring, in degrees
}

export const SCRABBLE_SCORES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10
};

export const scoreWord = (word: string) =>
  word.split('').reduce((sum, ch) => sum + (SCRABBLE_SCORES[ch] || 1), 0);

// The word list the board is built from: the dictionary file, uppercased, in file order
export function targetWords(dictionaryFile: string[]) {
  const words = new Set(dictionaryFile.map((w) => w.trim().toUpperCase()));
  words.add('GOUDA');
  words.add('EERIE');
  return Array.from(words);
}

// --- Seeded PRNG ---
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The same date and word list always give the same board
export function generateBoard(date: string, targets: string[]): SunshineBoard {
  const rand = mulberry32(xmur3(date)());

  const rings: (string | null)[][] = Array.from({ length: RING_COUNT }, () => new Array(SLOT_COUNT).fill(null));
  const chosenWords: string[] = [];

  for (let i = 0; i < 6; i++) {
    chosenWords.push(targets[Math.floor(rand() * targets.length)]);
  }
  chosenWords.sort((a, b) => b.length - a.length);

  const evenRadials = [0, 2, 4, 6, 8, 10];
  const oddRadials = [1, 3, 5, 7, 9, 11];

  for (let i = evenRadials.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [evenRadials[i], evenRadials[j]] = [evenRadials[j], evenRadials[i]];
  }
  for (let i = oddRadials.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [oddRadials[i], oddRadials[j]] = [oddRadials[j], oddRadials[i]];
  }

  const chosenRadials: number[] = [];
  for (let i = 0; i < 6; i++) {
    if (chosenWords[i].length === 6) {
      chosenRadials.push(evenRadials.pop()!);
    } else {
      let pool = (evenRadials.length >= oddRadials.length && evenRadials.length > 0) ? evenRadials : oddRadials;
      if (pool.length === 0) pool = evenRadials;
      chosenRadials.push(pool.pop()!);
    }
  }

  for (let i = 0; i < 6; i++) {
    const word = chosenWords[i];
    const rad = chosenRadials[i];
    const direction = rand() < 0.5 ? 'outward' : 'inward';
    const ring0Available = rad % 2 === 0;
    const minStartR = ring0Available ? 0 : 1;
    const maxStartR = 6 - word.length;
    const startRing = minStartR + Math.floor(rand() * (maxStartR - minStartR + 1));

    for (let j = 0; j < word.length; j++) {
      const ringIndex = startRing + j;
      const char = direction === 'outward' ? word[j] : word[word.length - 1 - j];
      rings[ringIndex][rad] = char;
    }
  }

  const letterPool = "EEEEEEEEEEAAAAAAAAAIIIIIIIIIOOOOOOOONNNNNNTRRRRRRTTTTTTLLLLSSSSUUUUDDDDGGGBBCCMMPPFFHHVVWWYYKJXQZ";
  for (let r = 0; r < RING_COUNT; r++) {
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (r === 0 && s % 2 !== 0) continue;
      if (!rings[r][s]) {
        rings[r][s] = letterPool[Math.floor(rand() * letterPool.length)];
      }
    }
  }

  const angles = [0, 0, 0, 0, 0, 0];
  for (let r = 0; r < 5; r++) {
    angles[r] = Math.floor(rand() * 12) * 30;
  }

  return { rings, angles };
}

// Stored form: one 12-character string per ring, '.' for an empty slot
export const encodeRings = (rings: (string | null)[][]) => rings.map((ring) => ring.map((c) => c ?? '.').join(''));
export const decodeRings = (encoded: string[]) =>
  encoded.map((ring) => ring.split('').map((c) => (c === '.' ? null : c)));
