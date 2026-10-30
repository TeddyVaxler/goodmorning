import React from 'react';
import { CheckCircle, Lock } from 'lucide-react';

// Context provided by the game loop to check achievement conditions
export interface AchievementContext {
  mornings: number;
  inventory: Record<string, number>;
  unlockedAchievements: string[];
  mps: number;
  upgrades: { id: string }[];
  manualClicks: number;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  checkUnlocked: (context: AchievementContext) => boolean;
}

// Human-editable collection of achievements with embedded functional goals
export const ACHIEVEMENTS: Achievement[] = [
    {
        id: 'working_hard',
        name:"Working Hard",
        desc: 'Manually click 1000 times.',
        icon: '👆',
        checkUnlocked:(ctx) => ctx.manualClicks >= 1000
    },
    {
        id: 'david_bday',
        name:"David's Birthday",
        desc: 'Manually click 1203 times.',
        icon: '🥳',
        checkUnlocked:(ctx) => ctx.manualClicks >= 1203
    },
    {
        id: 'hardly_working',
        name:"Hardly Working",
        desc: 'Reach 1000 Mornings / sec.',
        icon: '💅',
        checkUnlocked:(ctx) => ctx.mps >= 1000
    },
    {
        id: 'bakers_dozen',
        name:"Baker's Dozen",
        desc: 'Buy 13 donuts.',
        icon: '🍩',
        checkUnlocked:(ctx) => (ctx.inventory['donuts'] || 0) >= 13
    },
  {
    id: 'first_click',
    name: 'The Journey Begins',
    desc: 'Say good morning to the boss.',
    icon: '🎯',
    checkUnlocked: (ctx) => ctx.mornings > 0 || ctx.unlockedAchievements.length > 0,
  },
  {
    id: 'coffee_addict',
    name: 'Caffeine Buzz',
    desc: 'Buy 10 Extra Espresso upgrades.',
    icon: '☕',
    checkUnlocked: (ctx) => (ctx.inventory['coffee'] || 0) >= 10,
  },
  {
    id: 'passive_income',
    name: 'Taking a Break',
    desc: 'Reach 100 Mornings / sec.',
    icon: '📈',
    checkUnlocked: (ctx) => ctx.mps >= 100,
  },
  {
    id: 'hoarder',
    name: 'Saving Up',
    desc: 'Bank 10,000 Mornings in your wallet.',
    icon: '💰',
    checkUnlocked: (ctx) => ctx.mornings >= 10000,
  },
  {
    id: 'office_party',
    name: 'Office Party',
    desc: 'Buy at least 1 of every upgrade.',
    icon: '🎉',
    checkUnlocked: (ctx) => ctx.upgrades.length > 0 && ctx.upgrades.every((u) => (ctx.inventory[u.id] || 0) >= 1),
  },
];

export default function AchievementsList({ unlockedIds }: { unlockedIds: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      {ACHIEVEMENTS.map((ach) => {
        const isUnlocked = unlockedIds.includes(ach.id);
        return (
          <div
            key={ach.id}
            className={`flex items-center gap-3 p-3 sm:p-4 border-2 border-[#1A2E35] transition-all ${
              isUnlocked
                ? 'bg-[#f4f7f5] shadow-[3px_3px_0px_0px_#1A2E35]'
                : 'bg-gray-100 opacity-60'
            }`}
          >
            <div className="text-2xl sm:text-3xl shrink-0">{ach.icon}</div>
            <div className="flex-1">
              <h3 className="font-bold text-[#1A2E35] text-sm sm:text-lg">{ach.name}</h3>
              <p className="text-[10px] sm:text-xs font-bold text-gray-600">{ach.desc}</p>
            </div>
            <div className="shrink-0 text-[#1A2E35]">
              {isUnlocked ? (
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-[#006b5b]" />
              ) : (
                <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}