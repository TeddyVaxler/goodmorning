"use client";

import Modal from './Modal';
import { BriefcaseBusiness } from 'lucide-react';
import { jobTitle, promotionMultiplier, type GameState } from '@/lib/idle';
import { PrimaryButton, SecondaryButton } from './buttons';

interface PromotionModalProps {
  game: GameState;
  onPromote: () => void;
  onClose: () => void;
}

// Prestige: trade this job's mornings and upgrades for a permanent x2 and a new title
export default function PromotionModal({ game, onPromote, onClose }: PromotionModalProps) {
  const next = game.promotions + 1;

  return (
    <Modal labelledBy="promotion-title" onClose={onClose} closeLabel="Not yet" size="sm">
      <div className="flex flex-col items-center gap-4 text-center">
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
      </div>
    </Modal>
  );
}
