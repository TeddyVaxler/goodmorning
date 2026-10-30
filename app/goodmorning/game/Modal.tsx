"use client";

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  labelledBy: string; // id of the element holding the dialog's title
  onClose: () => void;
  closeLabel?: string;
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

// Shared popup shell: dimmed backdrop (click to close), spring-in dialog, close button, Escape.
// Place it inside <AnimatePresence> so it animates out.
export default function Modal({ labelledBy, onClose, closeLabel = 'Close', size = 'md', children }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
        aria-labelledby={labelledBy}
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${size === 'sm' ? 'max-w-sm' : 'max-w-md'} max-h-full overflow-y-auto overscroll-contain flex flex-col gap-4 p-5 sm:p-6 bg-white border-2 border-[#1A2E35] shadow-[8px_8px_0px_0px_#1A2E35]`}
      >
        <button onClick={onClose} aria-label={closeLabel} className="absolute top-3 right-3 p-1 hover:text-[#006b5b] touch-manipulation">
          <X className="w-6 h-6" />
        </button>
        {children}
      </motion.div>
    </motion.div>
  );
}
