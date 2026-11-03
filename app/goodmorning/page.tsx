"use client";

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sun } from 'lucide-react';
import { Montserrat } from 'next/font/google';
import Link from 'next/link';
import ThemePicker from '@/app/ThemePicker';

const montserrat = Montserrat({ subsets: ['latin'] });

export default function BossJokePage() {
  const [faces, setFaces] = useState<Array<{ id: number; startX: number; startY: number }>>([]);
  const [clickCount, setClickCount] = useState(0);

  const triggerGoodMorning = useCallback(() => {
    const newFaces = Array.from({ length: 20 }).map(() => ({
      id: Math.random(),
      startX: Math.random() * 100, 
      startY: Math.random() * 100, 
    }));
    
    setFaces((prev) => [...prev, ...newFaces].slice(-100));
    setClickCount((prev) => prev + 1);
  }, []);

  return (
    <main className={`relative min-h-screen w-full bg-page text-ink ${montserrat.className} overflow-hidden flex flex-col items-center justify-center p-4 selection:bg-sun selection:text-night`}>
      
      <div className="z-10 flex flex-col items-center justify-center gap-4 p-6 sm:p-8 bg-paper border-2 border-line w-[95%] sm:w-fit max-w-lg text-center shadow-[4px_4px_0px_0px_rgb(var(--line))]">
        
        <h1 className="text-3xl sm:text-4xl font-black mb-2 uppercase tracking-widest text-ink">Good Morning</h1>

        <div className="flex flex-col w-full gap-4 mt-2 mb-4">
          <Link 
            href="/goodmorning/game"
            className="group relative inline-flex items-center justify-center gap-2 sm:gap-3 px-6 sm:px-8 py-4 bg-teal hover:bg-sun text-white hover:text-ink font-bold border-2 border-line text-lg sm:text-xl transition-colors cursor-pointer active:bg-leaf shadow-[3px_3px_0px_0px_rgb(var(--line))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none touch-manipulation w-full"
          >
            PLAY MORNING RUSH
          </Link>

          <Link 
            href="/sunshine"
            className="group relative inline-flex items-center justify-center gap-2 sm:gap-3 px-6 sm:px-8 py-4 bg-paper hover:bg-sun text-ink font-bold border-2 border-line text-lg sm:text-xl transition-colors cursor-pointer shadow-[3px_3px_0px_0px_rgb(var(--line))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none touch-manipulation w-full"
          >
            <Sun className="w-5 h-5 sm:w-6 sm:h-6 text-sun group-hover:text-ink group-hover:rotate-45 transition-transform shrink-0" />
            PLAY SUNSHINE PUZZLE
          </Link>

          <Link 
            href="/word"
            className="group relative inline-flex items-center justify-center gap-2 sm:gap-3 px-6 sm:px-8 py-4 bg-paper hover:bg-sun text-ink font-bold border-2 border-line text-lg sm:text-xl transition-colors cursor-pointer shadow-[3px_3px_0px_0px_rgb(var(--line))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none touch-manipulation w-full"
          >
            <span className="grid grid-cols-2 gap-0.5 shrink-0" aria-hidden="true">
              <span className="w-2.5 h-2.5 bg-teal" /><span className="w-2.5 h-2.5 bg-sun" />
              <span className="w-2.5 h-2.5 bg-gray-400" /><span className="w-2.5 h-2.5 bg-teal" />
            </span>
            PLAY MORNING WORD
          </Link>
        </div>

        <button 
          onClick={triggerGoodMorning}
          className="mt-2 text-xs font-black tracking-widest text-teal hover:text-ink hover:bg-sun px-3 py-2 border-2 border-transparent hover:border-line transition-all touch-manipulation"
        >
          SAY "GOOD MORNING!" ➔
        </button>

        <div className="w-full sm:w-64">
          <ThemePicker />
        </div>

        {clickCount > 0 && (
          <div className="mt-2 px-3 py-2 bg-sun text-ink border border-line text-xs font-bold tracking-wide w-full sm:w-auto">
            INTENSITY: <span className="text-teal font-extrabold">{clickCount * 20}x</span>
          </div>
        )}
      </div>

      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {faces.map((face) => (
          <DancingBossFace key={face.id} startX={face.startX} startY={face.startY} />
        ))}
      </div>
    </main>
  );
}

function DancingBossFace({ startX, startY }: { startX: number; startY: number }): JSX.Element {
  const randomDuration = 3 + Math.random() * 4;
  const targetX = startX + (Math.random() * 60 - 30);
  const targetY = startY + (Math.random() * 60 - 30);

  return (
    <motion.div
      initial={{ x: `${startX}vw`, y: `120vh`, scale: 0, opacity: 0 }}
      animate={{ 
        x: [`${startX}vw`, `${targetX}vw`, `${startX}vw`],
        y: [`120vh`, `${targetY}vh`, `-20vh`],
        rotate: [0, Math.random() > 0.5 ? 360 : -360, Math.random() > 0.5 ? 720 : -720],
        scale: [0, 1.2, 1, 1.5, 1],
        opacity: [0, 1, 1, 1, 0]
      }}
      transition={{ duration: randomDuration, ease: "easeInOut", times: [0, 0.3, 0.6, 0.8, 1], repeat: Infinity, repeatType: "mirror" }}
      className="absolute top-0 left-0 w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 flex items-center justify-center drop-shadow-xl will-change-transform"
    >
      <img src="/goodmorning.png" alt="Good Morning" className="w-full h-full object-contain" decoding="async" />
    </motion.div>
  );
}