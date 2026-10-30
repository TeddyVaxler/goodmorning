"use client";

import Modal from './Modal';
import { Medal } from 'lucide-react';
import { ACHIEVEMENTS } from '@/lib/achievements';

interface AchievementsModalProps {
  earned: string[];
  hasProfile: boolean;
  onClose: () => void;
}

// Every achievement, earned or locked. Earned ones show by the player's handle on the leaderboard.
export default function AchievementsModal({ earned, hasProfile, onClose }: AchievementsModalProps) {
  return (
    <Modal labelledBy="achievements-title" onClose={onClose} closeLabel="Close achievements" size="md">
        <div>
          <h2 id="achievements-title" className="text-2xl font-extrabold uppercase tracking-tighter flex items-center gap-2">
            <Medal className="w-6 h-6 text-[#006b5b]" /> Achievements
          </h2>
          <p className="text-xs font-bold text-gray-500">
            {earned.length} of {ACHIEVEMENTS.length} earned.{' '}
            {hasProfile ? 'Your top 3 show next to your @handle.' : 'Claim a handle to show your top 3 on the leaderboard.'}
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2">
          {ACHIEVEMENTS.map((a) => {
            const isEarned = earned.includes(a.id);
            return (
              <li
                key={a.id}
                className={`flex items-start gap-2 p-2 border-2 ${isEarned ? 'border-[#1A2E35] bg-[#fff8e6]' : 'border-dashed border-gray-300 bg-gray-50'}`}
              >
                <span className={`text-2xl leading-none ${isEarned ? '' : 'grayscale opacity-30'}`} aria-hidden="true">{a.emoji}</span>
                <span className="min-w-0">
                  <span className={`block text-xs font-black leading-tight ${isEarned ? '' : 'text-gray-500'}`}>{a.name}</span>
                  <span className="block text-[10px] font-bold text-gray-500 leading-tight">{a.description}</span>
                </span>
              </li>
            );
          })}
        </ul>
    </Modal>
  );
}
