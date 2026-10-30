"use client";

import { motion } from 'framer-motion';
import { Sun } from 'lucide-react';

interface GoldenSunProps {
  x: number; // Percent of the clicker panel, for the sun's center
  y: number;
  onCatch: () => void;
}

// A shiny sun that drifts across the clicker panel for a few seconds. Tapping it starts Golden Hour.
export default function GoldenSun({ x, y, onCatch }: GoldenSunProps) {
  // The wrapper does the centering: framer-motion's own transform would replace a translate class
  return (
    <div className="absolute z-40 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
    <motion.button
      onClick={onCatch}
      aria-label="Catch the Golden Sun"
      initial={{ scale: 0, opacity: 0, rotate: -90 }}
      animate={{ scale: [0, 1.2, 1], opacity: 1, rotate: 0, y: [0, -12, 0, 12, 0] }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.5, y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
      className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center rounded-full bg-[#fde047] border-4 border-[#1A2E35] shadow-[0_0_30px_10px_rgba(250,204,21,0.8)] touch-manipulation cursor-pointer"
    >
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        className="flex"
      >
        <Sun className="w-10 h-10 sm:w-12 sm:h-12 text-[#b45309] fill-[#facc15]" />
      </motion.span>
    </motion.button>
    </div>
  );
}
