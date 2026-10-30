"use client";

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { UserRound } from 'lucide-react';
import { type Profile, HANDLE_PATTERN, NAME_MAX_LENGTH, normalizeHandle } from '@/lib/usePlayer';

interface ProfileModalProps {
  profile: Profile | null;
  onSave: (input: Profile) => Promise<string | null>;
  onClose: () => void;
}

const inputClass =
  "w-full px-3 py-2 border-2 border-[#1A2E35] bg-white font-bold text-[#1A2E35] focus:outline-none focus:bg-[#fff8e6] disabled:opacity-60";

// Create or edit the player's @handle and name. Names stay private; only the handle is public.
export default function ProfileModal({ profile, onSave, onClose }: ProfileModalProps) {
  const [handle, setHandle] = useState(profile?.handle ?? '');
  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isSaving]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: Profile = {
      handle: normalizeHandle(handle),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    };

    if (!HANDLE_PATTERN.test(input.handle)) {
      setError('Handles are 3 to 20 letters, numbers, or underscores.');
      return;
    }
    if (!input.firstName || !input.lastName) {
      setError('Enter your first and last name.');
      return;
    }

    setIsSaving(true);
    setError(null);
    const saveError = await onSave(input);
    setIsSaving(false);
    if (saveError) setError(saveError);
    else onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => !isSaving && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A2E35]/60 p-4"
    >
      <motion.form
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-sm flex flex-col gap-4 p-6 bg-white border-2 border-[#1A2E35] shadow-[8px_8px_0px_0px_#1A2E35]"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <UserRound className="w-10 h-10 text-[#006b5b]" />
          <h2 id="profile-title" className="text-2xl font-extrabold uppercase tracking-tighter">
            {profile ? 'Edit Player' : 'Claim Your Handle'}
          </h2>
        </div>

        <label className="flex flex-col gap-1 text-xs font-black tracking-widest uppercase">
          Handle
          <div className="flex items-stretch">
            <span className="px-3 flex items-center border-2 border-r-0 border-[#1A2E35] bg-[#F9CB66] font-black text-base">@</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="morning_person"
              maxLength={21}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              disabled={isSaving}
              className={`${inputClass} normal-case tracking-normal text-base`}
            />
          </div>
        </label>

        <div className="flex gap-3">
          <label className="flex-1 flex flex-col gap-1 text-xs font-black tracking-widest uppercase">
            First name
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="given-name"
              disabled={isSaving}
              className={`${inputClass} normal-case tracking-normal text-base`}
            />
          </label>
          <label className="flex-1 flex flex-col gap-1 text-xs font-black tracking-widest uppercase">
            Last name
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="family-name"
              disabled={isSaving}
              className={`${inputClass} normal-case tracking-normal text-base`}
            />
          </label>
        </div>

        <p className="text-xs font-bold text-gray-600 text-center">
          Only your @handle is shown on the leaderboard. Your name stays private.
        </p>

        {error && (
          <p role="alert" className="px-3 py-2 bg-red-50 border-2 border-red-500 text-red-700 text-sm font-bold">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full px-6 py-3 bg-[#006b5b] hover:bg-[#F9CB66] text-white hover:text-[#1A2E35] font-bold border-2 border-[#1A2E35] shadow-[3px_3px_0px_0px_#1A2E35] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-colors touch-manipulation disabled:opacity-60 disabled:cursor-wait"
        >
          {isSaving ? 'Saving...' : 'Save Player'}
        </button>
      </motion.form>
    </motion.div>
  );
}
