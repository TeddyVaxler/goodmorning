"use client";

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sun } from 'lucide-react';
import { Montserrat } from 'next/font/google';
import Link from 'next/link';

const montserrat = Montserrat({ subsets: ['latin'] });

export default function BossJokePage() {
  const [faces, setFaces] = useState<Array<{ id: number; startX: number; startY: number }>>([]);
  const [clickCount, setClickCount] = useState(0);

  // useCallback prevents unnecessary re-renders when spam-clicking
  const triggerGoodMorning = useCallback(() => {
    const newFaces = Array.from({ length: 20 }).map(() => ({
      id: Math.random(),
      startX: Math.random() * 100, 
      startY: Math.random() * 100, 
    }));
    
    // Performance Fix: Capping the DOM at 60 faces max to prevent browser crashes
    setFaces((prev) => [...prev, ...newFaces].slice(-60));
    setClickCount((prev) => prev + 1);
  }, []);

  return (
    <main className={`relative min-h-screen w-full bg-[#f4f7f5] text-[#1A2E35] ${montserrat.className} overflow-hidden flex flex-col items-center justify-center p-4 selection:bg-[#F9CB66] selection:text-[#1A2E35]`}>
      
      <div className="z-10 flex flex-col items-center justify-center gap-4 p-6 sm:p-8 bg-white border-2 border-[#1A2E35] w-[95%] sm:w-fit max-w-lg text-center shadow-[4px_4px_0px_0px_#1A2E35]">
        
        <button 
          onClick={triggerGoodMorning}
          className="group relative inline-flex items-center justify-center gap-2 sm:gap-3 px-6 sm:px-8 py-4 sm:py-5 bg-[#006b5b] hover:bg-[#F9CB66] text-[#ffffff] hover:text-[#1A2E35] font-bold border-2 border-[#1A2E35] text-lg sm:text-xl transition-colors cursor-pointer active:bg-[#9FD085] shadow-[3px_3px_0px_0px_#1A2E35] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none touch-manipulation w-full sm:w-auto"
        >
          <Sun className="w-5 h-5 sm:w-6 sm:h-6 text-[#F9CB66] group-hover:text-[#1A2E35] group-hover:rotate-45 transition-transform shrink-0" />
          "Good Morning!"
        </button>

        {clickCount > 0 && (
          <div className="mt-2 px-3 py-2 bg-[#F9CB66] text-[#1A2E35] border border-[#1A2E35] text-xs font-bold tracking-wide w-full sm:w-auto">
            INTENSITY: <span className="text-[#006b5b] font-extrabold">{clickCount * 20}x</span>
          </div>
        )}

        <Link 
          href="goodmorning/game"
          className="mt-2 text-xs font-black tracking-widest text-[#006b5b] hover:text-[#1A2E35] hover:bg-[#F9CB66] px-3 py-2 border-2 border-transparent hover:border-[#1A2E35] transition-all touch-manipulation"
        >
          PLAY THE CLICKER GAME ➔
        </Link>
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
      // Performance Fix: will-change-transform delegates animation calculation to the GPU
      className="absolute top-0 left-0 w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 flex items-center justify-center drop-shadow-xl will-change-transform"
    >
      {/* Performance Fix: Added decoding="async" so image loading doesn't block UI thread */}
      <img src="/goodmorning.png" alt="Good Morning" className="w-full h-full object-contain" decoding="async" />
    </motion.div>
  );
}