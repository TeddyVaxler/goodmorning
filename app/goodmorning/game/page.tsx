"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Coffee, Mail, CircleDot, Newspaper, Users, ArrowLeft } from 'lucide-react';
import { Montserrat } from 'next/font/google';
import Link from 'next/link';

const montserrat = Montserrat({ subsets: ['latin'] });

const UPGRADES = [
  { id: 'coffee', name: 'Extra Espresso', type: 'click', baseCost: 15, effect: 1, icon: Coffee, desc: '+1 Morning per click' },
  { id: 'autoreply', name: 'Auto-Responder', type: 'passive', baseCost: 50, effect: 2, icon: Mail, desc: '+2 Mornings per sec' },
  { id: 'donuts', name: 'Breakroom Donuts', type: 'passive', baseCost: 300, effect: 10, icon: CircleDot, desc: '+10 Mornings per sec' },
  { id: 'newsletter', name: 'Company Newsletter', type: 'passive', baseCost: 1500, effect: 60, icon: Newspaper, desc: '+60 Mornings per sec' },
  { id: 'standup', name: 'Mandatory 8 AM Standup', type: 'passive', baseCost: 8000, effect: 400, icon: Users, desc: '+400 Mornings per sec' },
];

interface Particle {
  id: number;
  x: number;
  y: number;
  value: number;
}

export default function GoodMorningClicker() {
  const [mornings, setMornings] = useState(0);
  const [inventory, setInventory] = useState<Record<string, number>>({
    coffee: 0, autoreply: 0, donuts: 0, newsletter: 0, standup: 0
  });
  const [particles, setParticles] = useState<Particle[]>([]);

  // Performance Fix: Cache the math calculations so they don't re-run on every frame
  const clickPower = useMemo(() => 1 + (inventory.coffee * 1), [inventory.coffee]);
  const mps = useMemo(() => 
    (inventory.autoreply * 2) + (inventory.donuts * 10) + (inventory.newsletter * 60) + (inventory.standup * 400)
  , [inventory.autoreply, inventory.donuts, inventory.newsletter, inventory.standup]);

  useEffect(() => {
    if (mps === 0) return;
    const interval = setInterval(() => {
      setMornings((prev) => prev + mps);
    }, 1000);
    return () => clearInterval(interval);
  }, [mps]);

  const handleBossClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setMornings((prev) => prev + clickPower);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newParticle = { id: Date.now() + Math.random(), x, y, value: clickPower };
    
    // Performance Fix: Cap particles at 20 max to prevent lag on fast clicking
    setParticles((prev) => [...prev, newParticle].slice(-40));
  }, [clickPower]);

  // Performance Fix: Instead of setTimeout, use Framer's callback to prevent memory leaks
  const removeParticle = useCallback((id: number) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const getCost = useCallback((baseCost: number, count: number) => {
    return Math.floor(baseCost * Math.pow(1.15, count));
  }, []);

  const buyUpgrade = useCallback((id: string, baseCost: number) => {
    setInventory((prev) => {
      const currentCount = prev[id];
      const cost = Math.floor(baseCost * Math.pow(1.15, currentCount));
      
      setMornings((currentMornings) => {
        if (currentMornings >= cost) {
          return currentMornings - cost;
        }
        return currentMornings; // Failed to buy
      });

      // If we can afford it, increment inventory. (State relies on previous state safely here)
      return { ...prev, [id]: currentCount + 1 };
    });
  }, []);

  return (
    <main className={`min-h-[100dvh] w-full overflow-x-hidden bg-[#f4f7f5] text-[#1A2E35] ${montserrat.className} p-3 sm:p-4 md:p-8 flex flex-col lg:flex-row gap-4 md:gap-8 selection:bg-[#F9CB66] selection:text-[#1A2E35]`}>
      
      <div className="flex-1 flex flex-col items-center justify-between border-2 border-[#1A2E35] bg-white p-4 sm:p-6 shadow-[4px_4px_0px_0px_#1A2E35] sm:shadow-[8px_8px_0px_0px_#1A2E35] relative min-h-[50vh] lg:min-h-0">
        
        <div className="w-full flex justify-start mb-2">
          <Link href="/" className="flex items-center gap-2 text-[#006b5b] hover:text-[#F9CB66] font-bold transition-colors touch-manipulation px-2 py-1">
            <ArrowLeft className="w-5 h-5" /> <span className="hidden sm:inline">Back</span>
          </Link>
        </div>
        
        <div className="text-center space-y-2 sm:space-y-4">
          <h1 className="text-xl sm:text-3xl md:text-5xl font-extrabold uppercase tracking-tighter text-[#1A2E35]">
            Mornings Generated
          </h1>
          <div className="text-4xl sm:text-6xl md:text-8xl font-black text-[#006b5b] drop-shadow-md break-all px-2 will-change-contents">
            {Math.floor(mornings).toLocaleString()}
          </div>
          <div className="text-sm sm:text-lg font-bold bg-[#F9CB66] border-2 border-[#1A2E35] inline-block px-3 py-1 sm:px-4 sm:py-2 shadow-[2px_2px_0px_0px_#1A2E35]">
            {mps.toLocaleString()} / sec
          </div>
        </div>

        <div className="mt-8 mb-4 sm:mb-8 relative w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 cursor-pointer touch-manipulation" onClick={handleBossClick}>
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.92 }}
            className="w-full h-full rounded-full border-4 border-[#1A2E35] bg-[#F9CB66] flex items-center justify-center overflow-hidden shadow-[4px_4px_0px_0px_#1A2E35] sm:shadow-[6px_6px_0px_0px_#1A2E35] active:shadow-none transition-all select-none will-change-transform"
          >
            <img 
              src="/goodmorning.png" 
              alt="Click the Boss"
              className="w-full h-full object-contain pointer-events-none select-none"
              draggable={false}
              decoding="async"
            />
          </motion.div>

          <AnimatePresence>
            {particles.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 1, y: p.y, x: p.x, scale: 0.5 }}
                animate={{ opacity: 0, y: p.y - 100, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                onAnimationComplete={() => removeParticle(p.id)} // Safer than setTimeout
                className="absolute text-2xl sm:text-3xl font-black text-[#006b5b] pointer-events-none z-50 drop-shadow-lg will-change-transform"
                style={{ left: 0, top: 0 }}
              >
                +{p.value}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-1 lg:max-w-md w-full flex flex-col gap-3 sm:gap-4 border-2 border-[#1A2E35] bg-white p-4 sm:p-6 shadow-[4px_4px_0px_0px_#1A2E35] sm:shadow-[8px_8px_0px_0px_#1A2E35] max-h-[50vh] lg:max-h-none overflow-y-auto overscroll-contain">
        <h2 className="text-xl sm:text-2xl font-extrabold uppercase border-b-4 border-[#1A2E35] pb-2 mb-2 flex items-center gap-2 sticky top-0 bg-white z-10">
          <Sun className="w-5 h-5 sm:w-6 sm:h-6 text-[#F9CB66] fill-current" />
          The Daily Grind
        </h2>
        
        {UPGRADES.map((upgrade) => {
          const cost = getCost(upgrade.baseCost, inventory[upgrade.id]);
          const canAfford = mornings >= cost;
          const Icon = upgrade.icon;

          return (
            <button
              key={upgrade.id}
              onClick={() => {
                if (canAfford) buyUpgrade(upgrade.id, upgrade.baseCost);
              }}
              disabled={!canAfford}
              className={`group flex items-center justify-between p-3 sm:p-4 border-2 border-[#1A2E35] text-left transition-all touch-manipulation ${
                canAfford 
                ? 'bg-white hover:bg-[#F9CB66] shadow-[3px_3px_0px_0px_#1A2E35] sm:shadow-[4px_4px_0px_0px_#1A2E35] hover:translate-y-[2px] hover:translate-x-[2px] cursor-pointer hover:shadow-none' 
                : 'bg-gray-100 opacity-70 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`p-2 sm:p-3 border-2 border-[#1A2E35] shrink-0 ${canAfford ? 'bg-[#006b5b] text-white' : 'bg-gray-300 text-gray-600'}`}>
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-lg leading-tight">{upgrade.name}</h3>
                  <p className="text-[10px] sm:text-xs font-bold text-gray-600">{upgrade.desc}</p>
                  <p className={`text-xs sm:text-sm font-black mt-1 ${canAfford ? 'text-[#006b5b]' : 'text-red-500'}`}>
                    Cost: {cost.toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="text-xl sm:text-3xl font-black text-gray-300 group-hover:text-[#1A2E35] transition-colors px-2">
                {inventory[upgrade.id]}
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}