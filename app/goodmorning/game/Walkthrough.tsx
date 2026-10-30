"use client";

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MousePointerClick, ShoppingBag, Timer, AtSign, X, type LucideIcon } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from './buttons';

export const WALKTHROUGH_SEEN_KEY = 'goodmorning-onboarding-seen';

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}

const GAME_STEPS: Step[] = [
  {
    icon: MousePointerClick,
    title: 'Tap the boss',
    body: 'Every tap says good morning. Tap fast to build a combo (up to x5), and catch the Golden Sun when it floats by for 7x everything.',
  },
  {
    icon: ShoppingBag,
    title: 'Buy upgrades',
    body: 'Spend mornings in The Daily Grind. Upgrades earn for you, even while you’re away (up to 8 hours). Earn enough to get promoted for a permanent x2.',
  },
];

const ACCOUNT_STEPS: Step[] = [
  {
    icon: Timer,
    title: 'Play the daily Rush',
    body: 'Once a day: 30 seconds, one shot, tap as fast as you can. Your score goes on the leaderboard. Play every day to build a streak.',
  },
  {
    icon: AtSign,
    title: 'Claim your @handle',
    body: 'Pick a handle so your Rush scores show up on the leaderboard. No email needed. Only your handle is shown; your name stays private.',
  },
];

interface WalkthroughProps {
  accountsEnabled: boolean; // Rush and handles only exist once Supabase is configured
  hasProfile: boolean;
  onClaimHandle: () => void;
  onClose: () => void;
}

// How-to-play steps, shown on the first visit and from the "?" button
export default function Walkthrough({ accountsEnabled, hasProfile, onClaimHandle, onClose }: WalkthroughProps) {
  const steps = accountsEnabled ? [...GAME_STEPS, ...ACCOUNT_STEPS] : GAME_STEPS;
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;
  // The last step asks for a handle; players who have one just finish
  const asksForHandle = isLast && accountsEnabled && !hasProfile;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, steps.length]);

  const Icon = step.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A2E35]/60 p-4"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkthrough-title"
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative w-full max-w-sm max-h-full overflow-y-auto flex flex-col items-center gap-4 p-6 bg-white border-2 border-[#1A2E35] text-center shadow-[8px_8px_0px_0px_#1A2E35]"
      >
        <button
          onClick={onClose}
          aria-label="Skip how to play"
          className="absolute top-3 right-3 p-1 text-[#1A2E35] hover:text-[#006b5b] touch-manipulation"
        >
          <X className="w-6 h-6" />
        </button>

        <p className="text-xs font-black tracking-widest uppercase text-gray-500">
          How to play · {index + 1} of {steps.length}
        </p>

        <motion.div
          key={index}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="p-4 bg-[#F9CB66] border-2 border-[#1A2E35] shadow-[3px_3px_0px_0px_#1A2E35]">
            <Icon className="w-10 h-10 text-[#1A2E35]" />
          </div>
          <h2 id="walkthrough-title" className="text-2xl font-extrabold uppercase tracking-tighter">{step.title}</h2>
          <p className="text-sm font-bold text-gray-600">{step.body}</p>
        </motion.div>

        {/* Step dots */}
        <div className="flex gap-2" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`w-2.5 h-2.5 border-2 border-[#1A2E35] ${i === index ? 'bg-[#006b5b]' : 'bg-white'}`} />
          ))}
        </div>

        {asksForHandle ? (
          <>
            <PrimaryButton onClick={onClaimHandle} autoFocus>
              <AtSign className="w-5 h-5" /> Claim My Handle
            </PrimaryButton>
            <SecondaryButton onClick={onClose}>Maybe Later</SecondaryButton>
          </>
        ) : (
          <div className="w-full flex gap-2">
            {index > 0 && (
              <div className="flex-1">
                <SecondaryButton onClick={() => setIndex(index - 1)}>Back</SecondaryButton>
              </div>
            )}
            <div className="flex-1">
              <PrimaryButton onClick={isLast ? onClose : () => setIndex(index + 1)} autoFocus>
                {isLast ? "Let's Go" : 'Next'}
              </PrimaryButton>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
