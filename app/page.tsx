"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sun, Coffee } from 'lucide-react';

export default function BossJokePage() {
  const [faces, setFaces] = useState<Array<{ id: number; startX: number; startY: number }>>([]);
  const [clickCount, setClickCount] = useState(0);

  const triggerGoodMorning = () => {
    // Spawns 20 dancing faces per click
    const newFaces = Array.from({ length: 20 }).map(() => ({
      id: Math.random(),
      startX: Math.random() * 100, 
      startY: Math.random() * 100, 
    }));
    setFaces((prev) => [...prev, ...newFaces]);
    setClickCount((prev) => prev + 1);
  };

  return (
    <main className="relative min-h-screen bg-gradient-to-br from-slate-50 to-blue-100 overflow-hidden flex flex-col items-center justify-center selection:bg-amber-300">
      
      {/* Main UI Container */}
      <div className="z-10 flex flex-col items-center gap-6 p-10 bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 max-w-lg w-full mx-4">
        <div className="bg-amber-100 p-4 rounded-full">
          <Coffee className="w-10 h-10 text-amber-700" />
        </div>
        
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">
            The Daily Standup
          </h1>
          <p className="text-lg text-slate-600">
            Wait for it... the boss just logged on.
          </p>
        </div>
        
        <button 
          onClick={triggerGoodMorning}
          className="group relative inline-flex items-center gap-3 px-10 py-5 bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold rounded-full text-2xl transition-all shadow-[0_8px_0_0_#b45309] hover:shadow-[0_4px_0_0_#b45309] hover:translate-y-1 active:shadow-none active:translate-y-2"
        >
          <Sun className="w-8 h-8 group-hover:animate-spin" />
          "Good Morning!"
        </button>

        {clickCount > 0 && (
          <div className="mt-4 px-4 py-2 bg-slate-800 text-amber-400 rounded-full text-sm font-bold animate-pulse">
            Boss presence intensity: {clickCount * 20}x
          </div>
        )}
      </div>

      {/* Dancing Faces Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {faces.map((face) => (
          <DancingBossFace key={face.id} startX={face.startX} startY={face.startY} />
        ))}
      </div>
    </main>
  );
}

function DancingBossFace({ startX, startY }: { startX: number; startY: number }) {
  // Randomize animation paths so no two heads move exactly the same way
  const randomDuration = 3 + Math.random() * 4;
  const targetX = startX + (Math.random() * 60 - 30);
  const targetY = startY + (Math.random() * 60 - 30);

  return (
    <motion.div
      initial={{ 
        x: `${startX}vw`, 
        y: `120vh`, 
        scale: 0,
        opacity: 0
      }}
      animate={{ 
        x: [`${startX}vw`, `${targetX}vw`, `${startX}vw`],
        y: [`120vh`, `${targetY}vh`, `-20vh`],
        rotate: [0, Math.random() > 0.5 ? 360 : -360, Math.random() > 0.5 ? 720 : -720],
        scale: [0, 1.2, 1, 1.5, 1],
        opacity: [0, 1, 1, 1, 0]
      }}
      transition={{ 
        duration: randomDuration, 
        ease: "easeInOut",
        times: [0, 0.3, 0.6, 0.8, 1],
        repeat: Infinity,
        repeatType: "mirror"
      }}
      className="absolute w-24 h-24 sm:w-32 sm:h-32 drop-shadow-2xl"
    >
      {/* 
        ASSET PLACEHOLDER: 
        The image looks for `/goodmorning.png` in your public folder.
        If it fails to load, it falls back to an SVG emoji placeholder automatically. 
      */}
      <img 
        src="/goodmorning.png" 
        alt="Good Morning Face"
        className="w-full h-full object-cover rounded-full border-4 border-amber-400 bg-slate-200"
        onError={(e) => {
          (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23fbbf24"/><text x="50" y="55" font-size="50" text-anchor="middle" dominant-baseline="middle">😎</text></svg>';
        }}
      />
    </motion.div>
  );
}