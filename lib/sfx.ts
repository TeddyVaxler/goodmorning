// Game sounds, synthesized with the Web Audio API (no audio files to load), plus phone haptics.
// Browsers only allow audio after a user gesture, so the context is created on the first tap.

const MUTE_KEY = 'goodmorning-muted';

let context: AudioContext | null = null;
let muted: boolean | null = null;

export function isMuted() {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    // Storage blocked: the setting lasts for this visit only
  }
}

function audio() {
  if (isMuted() || typeof window === 'undefined') return null;
  if (!context) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    context = new Ctx();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

// One short note: frequency in Hz, start offset and length in seconds
function note(ctx: AudioContext, frequency: number, start: number, length: number, volume = 0.12, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  const t = ctx.currentTime + start;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

const vibrate = (pattern: number | number[]) => {
  if (isMuted()) return; // Muting turns off the buzz too
  try {
    navigator.vibrate?.(pattern); // Android; iPhones ignore it
  } catch {
    // Not supported
  }
};

// A soft pop that climbs in pitch as the combo builds (level 1-5)
export function playTap(level = 1) {
  vibrate(8);
  const ctx = audio();
  if (!ctx) return;
  note(ctx, 520 + level * 90 + Math.random() * 30, 0, 0.09, 0.08, 'triangle');
}

// Every 100 taps: a quick rising arpeggio
export function playMilestone() {
  vibrate([20, 30, 20]);
  const ctx = audio();
  if (!ctx) return;
  [523, 659, 784, 1047].forEach((f, i) => note(ctx, f, i * 0.06, 0.18, 0.1));
}

// Combo reached a new tier
export function playComboUp(level: number) {
  vibrate(15);
  const ctx = audio();
  if (!ctx) return;
  note(ctx, 600 + level * 120, 0, 0.12, 0.1, 'square');
  note(ctx, 900 + level * 120, 0.07, 0.14, 0.08, 'square');
}

// Golden Sun caught: a shimmering chime
export function playGolden() {
  vibrate([30, 40, 30, 40, 60]);
  const ctx = audio();
  if (!ctx) return;
  [784, 988, 1175, 1568, 1976].forEach((f, i) => note(ctx, f, i * 0.07, 0.5, 0.09));
}

// Promotion: a short fanfare
export function playFanfare() {
  vibrate([50, 50, 50, 50, 150]);
  const ctx = audio();
  if (!ctx) return;
  [[523, 0], [523, 0.12], [523, 0.24], [659, 0.36], [784, 0.6]].forEach(([f, t]) => note(ctx, f, t, 0.3, 0.12, 'triangle'));
  note(ctx, 1047, 0.84, 0.7, 0.12, 'triangle');
}

// Unlock (new skin, new upgrade): two bright notes
export function playUnlock() {
  vibrate(25);
  const ctx = audio();
  if (!ctx) return;
  note(ctx, 880, 0, 0.15, 0.1);
  note(ctx, 1320, 0.1, 0.25, 0.1);
}
