"use client";

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RUSH_SECONDS, type RushTwist } from '@/lib/rush';
import BossHat, { type Season } from './BossHat';

interface RushFieldProps {
  twist: RushTwist;
  isPlaying: boolean;
  timeLeft: number;
  season: Season | null;
  onHit: () => void;
  onDecoy: () => void;
}

interface Spot {
  x: number; // Percent of the field, for the boss's center
  y: number;
}

const CENTER: Spot = { x: 50, y: 50 };
// Keeps a scaled-down boss fully inside the field
const randomSpot = (): Spot => ({ x: 22 + Math.random() * 56, y: 28 + Math.random() * 44 });

// How big the boss is under each twist (1 = full size)
function bossScale(twist: RushTwist, timeLeft: number) {
  switch (twist.id) {
    case 'tiny': return 0.5;
    case 'shrink': return 0.35 + 0.65 * (timeLeft / RUSH_SECONDS);
    case 'moving':
    case 'decoys': return 0.6;
    default: return 1;
  }
}

// The Rush play area. The daily twist decides how the boss behaves: it moves, shrinks, blinks,
// or hides among decoys. Scoring rules don't change, so every day's leaderboard is comparable.
export default function RushField({ twist, isPlaying, timeLeft, season, onHit, onDecoy }: RushFieldProps) {
  const [spot, setSpot] = useState<Spot>(CENTER);
  const [decoys, setDecoys] = useState<Spot[]>([]);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!isPlaying) return;
    if (twist.id === 'moving' || twist.id === 'decoys') {
      const shuffle = () => {
        setSpot(randomSpot());
        if (twist.id === 'decoys') setDecoys([randomSpot(), randomSpot()]);
      };
      shuffle();
      const interval = setInterval(shuffle, twist.id === 'moving' ? 1100 : 1500);
      return () => clearInterval(interval);
    }
    if (twist.id === 'blink') {
      // Visible 1.4s, gone 0.6s
      let visible = true;
      let timer: ReturnType<typeof setTimeout>;
      const flip = () => {
        visible = !visible;
        setIsVisible(visible);
        timer = setTimeout(flip, visible ? 1400 : 600);
      };
      timer = setTimeout(flip, 1400);
      return () => {
        clearTimeout(timer);
        setIsVisible(true); // The round ended mid-blink: don't leave the boss invisible
      };
    }
  }, [isPlaying, twist.id]);

  const scale = bossScale(twist, timeLeft);
  const handleHit = () => {
    if (twist.id === 'blink' && !isVisible) return; // Taps on thin air don't count
    onHit();
  };

  return (
    <div className="relative w-full h-64 sm:h-72 short:h-40 shrink-0">
      {decoys.map((d, i) => (
        <Boss key={i} spot={d} scale={scale} isDecoy disabled={!isPlaying} onTap={onDecoy} season={null} />
      ))}
      <Boss spot={spot} scale={scale} disabled={!isPlaying} onTap={handleHit} season={season} isHidden={!isVisible} />
    </div>
  );
}

function Boss({ spot, scale, disabled, onTap, season, isDecoy = false, isHidden = false }: {
  spot: Spot;
  scale: number;
  disabled: boolean;
  onTap: () => void;
  season: Season | null;
  isDecoy?: boolean;
  isHidden?: boolean;
}) {
  return (
    // Plain element for position and size (framer-motion would overwrite this transform)
    <div
      className="absolute w-56 h-56 sm:w-64 sm:h-64 short:w-36 short:h-36 transition-[left,top,transform,opacity] duration-300 ease-out"
      style={{
        left: `${spot.x}%`,
        top: `${spot.y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity: isHidden ? 0.08 : 1,
      }}
    >
      <motion.button
        onClick={onTap}
        // Holding Enter auto-repeats clicks; only fresh key presses count
        onKeyDown={(e) => e.repeat && e.preventDefault()}
        disabled={disabled}
        whileTap={{ scale: 0.92 }}
        aria-label={isDecoy ? 'Decoy boss' : 'Say good morning'}
        className={`w-full h-full rounded-full border-4 overflow-hidden shadow-[4px_4px_0px_0px_#1A2E35] select-none touch-manipulation cursor-pointer disabled:cursor-wait ${
          isDecoy ? 'bg-[#a78bfa] border-[#7f1d1d]' : 'bg-[#F5A800] border-[#1A2E35]'
        }`}
      >
        <img
          src="/goodmorning.png"
          alt=""
          className={`w-full h-full object-contain pointer-events-none select-none ${isDecoy ? '[filter:hue-rotate(160deg)_saturate(1.6)]' : ''}`}
          draggable={false}
        />
      </motion.button>
      {season && <BossHat season={season} />}
    </div>
  );
}
