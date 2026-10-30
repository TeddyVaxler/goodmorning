"use client";

import Modal from './Modal';
import { Palette, Lock, Volume2, VolumeX } from 'lucide-react';
import { BOSS_SKINS, formatNumber, type GameState } from '@/lib/idle';
import BossHat, { SEASON_NAMES, type Season } from './BossHat';

interface WardrobeModalProps {
  game: GameState;
  season: Season | null;
  isMuted: boolean;
  onSelectSkin: (id: string) => void;
  onToggleHat: () => void;
  onToggleMute: () => void;
  onClose: () => void;
}

// Pick a boss skin (unlocked by all-time mornings), the seasonal hat, and sound
export default function WardrobeModal({ game, season, isMuted, onSelectSkin, onToggleHat, onToggleMute, onClose }: WardrobeModalProps) {
  return (
    <Modal labelledBy="wardrobe-title" onClose={onClose} closeLabel="Close wardrobe" size="md">
        <h2 id="wardrobe-title" className="text-2xl font-extrabold uppercase tracking-tighter flex items-center gap-2">
          <Palette className="w-6 h-6 text-[#006b5b]" /> Boss Wardrobe
        </h2>

        <div className="grid grid-cols-3 gap-3">
          {BOSS_SKINS.map((skin) => {
            const isUnlocked = game.totalMornings >= skin.unlockAt;
            const isSelected = game.skin === skin.id;
            return (
              <button
                key={skin.id}
                onClick={() => isUnlocked && onSelectSkin(skin.id)}
                disabled={!isUnlocked}
                aria-pressed={isSelected}
                className={`flex flex-col items-center gap-1 p-2 border-2 border-[#1A2E35] text-center touch-manipulation transition-colors ${
                  isSelected ? 'bg-[#F9CB66] shadow-[3px_3px_0px_0px_#1A2E35]' : isUnlocked ? 'bg-white hover:bg-[#fff8e6]' : 'bg-gray-100'
                }`}
              >
                <div className={`relative w-14 h-14 rounded-full border-2 overflow-visible ${skin.ringClass} ${isUnlocked ? '' : 'grayscale opacity-50'}`}>
                  <img src="/goodmorning.png" alt="" className="w-full h-full rounded-full object-contain" draggable={false} />
                  {skin.overlay && <span className={`absolute leading-none text-[26px] ${skin.overlayClass.replace(/text-\[[^\]]+\]/, '')}`}>{skin.overlay}</span>}
                  {!isUnlocked && <Lock className="absolute inset-0 m-auto w-6 h-6 text-[#1A2E35]" />}
                </div>
                <span className="text-xs font-black leading-tight">{skin.name}</span>
                <span className="text-[10px] font-bold text-gray-500">
                  {isUnlocked ? (isSelected ? 'Wearing' : 'Unlocked') : `${formatNumber(skin.unlockAt)} total`}
                </span>
              </button>
            );
          })}
        </div>

        {season && (
          <label className="flex items-center justify-between gap-3 p-3 border-2 border-[#1A2E35] bg-[#f4f7f5] cursor-pointer">
            <span className="flex items-center gap-3">
              <span className="relative w-12 h-12 shrink-0">
                <span className="absolute inset-x-0 bottom-0 h-8 rounded-full bg-[#F5A800] border-2 border-[#1A2E35]" />
                <span className="absolute inset-0 top-4"><BossHat season={season} /></span>
              </span>
              <span className="text-sm font-bold">{SEASON_NAMES[season]} hat</span>
            </span>
            <input type="checkbox" checked={!game.hideSeasonalHat} onChange={onToggleHat} className="w-5 h-5 accent-[#006b5b]" />
          </label>
        )}

        <button
          onClick={onToggleMute}
          className="flex items-center justify-between gap-3 p-3 border-2 border-[#1A2E35] bg-white hover:bg-[#fff8e6] text-sm font-bold touch-manipulation"
        >
          <span className="flex items-center gap-2">
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />} Sound effects
          </span>
          <span className="font-black">{isMuted ? 'Off' : 'On'}</span>
        </button>
    </Modal>
  );
}
