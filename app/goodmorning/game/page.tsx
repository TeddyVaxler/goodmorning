"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Coffee, Mail, CircleDot, Newspaper, Users, ArrowLeft } from 'lucide-react';
import { Montserrat } from 'next/font/google';
import Link from 'next/link';

const montserrat = Montserrat({ subsets: ['latin'] });

// ==========================================
// 1. GAME DATA (Easy to edit and expand!)
// ==========================================
const UPGRADES = [
  { id: 'coffee', name: 'Extra Espresso', type: 'click', baseCost: 15, effect: 1, icon: Coffee, desc: '+1 Morning per click' },
  { id: 'autoreply', name: 'Auto-Responder', type: 'passive', baseCost: 50, effect: 2, icon: Mail, desc: '+2 Mornings / sec' },
  { id: 'donuts', name: 'Breakroom Donuts', type: 'passive', baseCost: 300, effect: 10, icon: CircleDot, desc: '+10 Mornings / sec' },
  { id: 'newsletter', name: 'Company Newsletter', type: 'passive', baseCost: 1500, effect: 60, icon: Newspaper, desc: '+60 Mornings / sec' },
  { id: 'standup', name: 'Mandatory 8 AM Standup', type: 'passive', baseCost: 8000, effect: 400, icon: Users, desc: '+400 Mornings / sec' },
];

// ==========================================
// 2. TYPES
// ==========================================
interface Particle {
  id: number;
  x: number;
  y: number;
  value: number;
}

// ==========================================
// 3. MAIN GAME COMPONENT
// ==========================================
export default function GoodMorningClicker() {
  // --- STATE (The Game's Memory) ---
  const [mornings, setMornings] = useState(0);
  const [inventory, setInventory] = useState<Record<string, number>>({
    coffee: 0, autoreply: 0, donuts: 0, newsletter: 0, standup: 0
  });
  const [particles, setParticles] = useState<Particle[]>([]);
  const [rayCount, setRayCount] = useState(0); // Tracks the sun rays!

  // --- DERIVED STATS (Math calculated automatically) ---
  const clickPower = useMemo(() => 1 + (inventory.coffee * 1), [inventory.coffee]);
  
  const mps = useMemo(() => 
    (inventory.autoreply * 2) + 
    (inventory.donuts * 10) + 
    (inventory.newsletter * 60) + 
    (inventory.standup * 400)
  , [inventory.autoreply, inventory.donuts, inventory.newsletter, inventory.standup]);

  // --- GAME LOOP (Passive Income) ---
  useEffect(() => {
    if (mps === 0) return;
    const interval = setInterval(() => {
      setMornings((prev) => prev + mps);
    }, 1000);
    return () => clearInterval(interval);
  }, [mps]);

  // --- ACTIONS (What happens when you click) ---
  const handleBossClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 1. Add score
    setMornings((prev) => prev + clickPower);
    
    // 2. Add a Sun Ray (Caps at 72 rays to form a full circle)
    setRayCount((prev) => (prev < 72 ? prev + 1 : prev));

    // 3. Spawn floating text particle
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newParticle = { id: Date.now() + Math.random(), x, y, value: clickPower };
    setParticles((prev) => [...prev, newParticle].slice(-20)); // Keep max 20 on screen
  }, [clickPower]);

  const removeParticle = useCallback((id: number) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const buyUpgrade = useCallback((id: string, baseCost: number) => {
    // 1. Calculate the exact cost using your current inventory
    const currentCount = inventory[id];
    const cost = Math.floor(baseCost * Math.pow(1.15, currentCount));

    // 2. Check if you can afford it BEFORE triggering any state changes
    if (mornings >= cost) {
      // 3. Deduct the cost
      setMornings((prev) => prev - cost);
      
      // 4. Add the item to the inventory
      setInventory((prev) => ({ ...prev, [id]: prev[id] + 1 }));
    }
  }, [inventory, mornings]); // We added inventory and mornings to the dependency array so the function always has the freshest math

  // --- UI RENDERING ---
  return (
    <main className={`min-h-[100dvh] w-full overflow-x-hidden bg-[#f4f7f5] text-[#1A2E35] ${montserrat.className} p-3 sm:p-4 md:p-8 flex flex-col lg:flex-row gap-4 md:gap-8 selection:bg-[#F9CB66]`}>
      
      {/* LEFT AREA: The Clicker Area */}
      <div className="flex-1 flex flex-col items-center border-2 border-[#1A2E35] bg-white p-4 sm:p-6 shadow-[4px_4px_0px_0px_#1A2E35] sm:shadow-[8px_8px_0px_0px_#1A2E35] relative overflow-hidden">
        
        {/* Nav */}
        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20">
          <Link href="/goodmorning" className="flex items-center gap-2 text-[#006b5b] hover:text-[#F9CB66] font-bold transition-colors touch-manipulation px-2 py-1">
            <ArrowLeft className="w-5 h-5" /> <span className="hidden sm:inline">Back</span>
          </Link>
        </div>
        
        {/* Scoreboard */}
        <div className="text-center space-y-2 sm:space-y-4 z-10 relative shrink-0">
          <h1 className="text-xl sm:text-3xl md:text-5xl font-extrabold uppercase tracking-tighter text-[#1A2E35]">
            Mornings Gooded
          </h1>
          <div className="text-4xl sm:text-6xl md:text-8xl font-black text-[#006b5b] drop-shadow-md break-all px-2">
            {Math.floor(mornings).toLocaleString()}
          </div>
          <div className="text-sm sm:text-lg font-bold bg-[#F9CB66] border-2 border-[#1A2E35] inline-block px-3 py-1 sm:px-4 sm:py-2 shadow-[2px_2px_0px_0px_#1A2E35]">
            {mps.toLocaleString()} / sec
          </div>
        </div>

        {/* The Clickable Sun/Boss */}
      <div className="flex-1 w-full flex items-center justify-center mt-4 sm:mt-8 z-10 relative">
        <div className="mt-8 mb-4 sm:mb-8 relative w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 touch-manipulation">
          
          {/* THE NEW SUN RAYS BACKGROUND */}
          <motion.div 
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          >
            {Array.from({ length: rayCount }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ height: '0%', opacity: 0 }}
                animate={{ height: '150%', opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 12 }} //stiffness is speed, damping
                // Rotates each new ray by 5 degrees (360 / 72 = 5)
                style={{ rotate: i * 5 , height: '150%', transformOrigin: 'center'}}
                className="absolute origin-center w-2 sm:w-3 bg-[#F9CB66] rounded-full"
                // The height makes the rays shoot outward past the container
              />
            ))}
          </motion.div>

          {/* The Clickable Button */}
          <motion.div 
            onClick={handleBossClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative z-10 w-full h-full rounded-full border-4 border-[#1A2E35] bg-[#F5A800] flex items-center justify-center overflow-hidden shadow-[4px_4px_0px_0px_#1A2E35] active:shadow-none transition-all select-none cursor-pointer"
          >
            <img 
              src="/goodmorning.png" 
              alt="Click the Boss"
              className="w-full h-full object-contain pointer-events-none select-none"
              draggable={false}
            />
          </motion.div>

          {/* Floating Particles (+1) */}
          <AnimatePresence>
            {particles.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 1, y: p.y, x: p.x, scale: 0.5 }}
                animate={{ opacity: 0, y: p.y - 100, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                onAnimationComplete={() => removeParticle(p.id)} 
                className="absolute text-2xl sm:text-3xl font-black text-[#006b5b] pointer-events-none z-50 drop-shadow-lg"
                style={{ left: 0, top: 0 }}
              >
                +{p.value}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>

      {/* RIGHT AREA: The Shop */}
      <div className="flex-1 lg:max-w-md w-full flex flex-col gap-3 sm:gap-4 border-2 border-[#1A2E35] bg-white p-4 sm:p-6 shadow-[4px_4px_0px_0px_#1A2E35] sm:shadow-[8px_8px_0px_0px_#1A2E35] max-h-[50vh] lg:max-h-none overflow-y-auto overscroll-contain">
        <h2 className="text-xl sm:text-2xl font-extrabold uppercase border-b-4 border-[#1A2E35] pb-2 mb-2 flex items-center gap-2 sticky top-0 bg-white z-20">
          <Sun className="w-5 h-5 sm:w-6 sm:h-6 text-[#F9CB66] fill-current" />
          The Daily Grind
        </h2>
        
        {UPGRADES.map((upgrade) => {
          // Calculate the current cost based on how many you already own
          const cost = Math.floor(upgrade.baseCost * Math.pow(1.15, inventory[upgrade.id]));
          const canAfford = mornings >= cost;

          // Instead of a massive block of HTML here, we use our extracted component!
          return (
            <UpgradeButton
              key={upgrade.id}
              upgrade={upgrade}
              cost={cost}
              owned={inventory[upgrade.id]}
              canAfford={canAfford}
              onBuy={() => buyUpgrade(upgrade.id, upgrade.baseCost)}
            />
          );
        })}
      </div>
    </main>
  );
}

// ==========================================
// 4. SUB-COMPONENTS (Clean code!)
// ==========================================

// This extracts the messy HTML of the shop button into its own clean function.
// It receives data (props) from the main game and returns the UI.
function UpgradeButton({ upgrade, cost, owned, canAfford, onBuy }: any) {
  const Icon = upgrade.icon;
  
  return (
    <button
      onClick={onBuy}
      disabled={!canAfford}
      className={`group flex items-center justify-between p-3 sm:p-4 border-2 border-[#1A2E35] text-left transition-all touch-manipulation ${
        canAfford 
        ? 'bg-white hover:bg-[#F9CB66] shadow-[3px_3px_0px_0px_#1A2E35] hover:translate-y-[2px] hover:translate-x-[2px] cursor-pointer hover:shadow-none' 
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
        {owned}
      </div>
    </button>
  );
}