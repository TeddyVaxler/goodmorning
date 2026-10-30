"use client";

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { BriefcaseBusiness, X } from 'lucide-react';
import { jobTitle, promotionMultiplier, type GameState } from '@/lib/idle';
import { PrimaryButton, SecondaryButton } from './buttons';

interface PromotionModalProps {
  game: GameState;
  onPromote: () => void;
  onClose: () => void;
}

// Prestige: trade this job's mornings and upgrades for a permanent x2 and a new title
export default function PromotionModal({ game, onPromote, onClose }: PromotionModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const next = game.promotions + 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A2E35]/60 p-4"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promotion-title"
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm max-h-full overflow-y-auto flex flex-col items-center gap-4 p-6 bg-white border-2 border-[#1A2E35] text-center shadow-[8px_8px_0px_0px_#1A2E35]"
      >
        <button onClick={onClose} aria-label="Not yet" className="absolute top-3 right-3 p-1 hover:text-[#006b5b] touch-manipulation">
          <X className="w-6 h-6" />
        </button>
        <div className="p-4 bg-[#F9CB66] border-2 border-[#1A2E35] shadow-[3px_3px_0px_0px_#1A2E35]">
          <BriefcaseBusiness className="w-10 h-10" />
        </div>
        <h2 id="promotion-title" className="text-2xl font-extrabold uppercase tracking-tighter">You&apos;re Getting Promoted!</h2>

        <div className="w-full flex items-center justify-center gap-3 text-sm font-black">
          <span className="px-2 py-1 border-2 border-[#1A2E35] bg-gray-100">{jobTitle(game.promotions)}</span>
          <span aria-hidden="true">→</span>
          <span className="px-2 py-1 border-2 border-[#1A2E35] bg-[#9FD085]">{jobTitle(next)}</span>
        </div>

        <div className="w-full grid grid-cols-2 gap-2 text-left text-xs font-bold">
          <div className="p-3 border-2 border-[#1A2E35] bg-[#f0fdf4]">
            <p className="font-black uppercase tracking-widest text-[#006b5b] mb-1">You get</p>
            <p>Everything earns <span className="font-black">×{promotionMultiplier(next)}</span> forever (now ×{promotionMultiplier(game.promotions)})</p>
          </div>
          <div className="p-3 border-2 border-[#1A2E35] bg-[#fef2f2]">
            <p className="font-black uppercase tracking-widest text-red-600 mb-1">You reset</p>
            <p>Mornings and upgrades. Skins and stats stay.</p>
          </div>
        </div>

        <PrimaryButton onClick={onPromote} autoFocus>Accept the Promotion</PrimaryButton>
        <SecondaryButton onClick={onClose}>Not Yet</SecondaryButton>
      </motion.div>
    </motion.div>
  );
}
