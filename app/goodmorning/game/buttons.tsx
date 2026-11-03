"use client";

// Shared modal buttons in the game's flat, hard-shadow style

export function PrimaryButton({ children, onClick, autoFocus }: { children: React.ReactNode; onClick: () => void; autoFocus?: boolean }) {
  return (
    <button
      onClick={onClick}
      autoFocus={autoFocus}
      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-teal hover:bg-sun text-white hover:text-ink font-bold border-2 border-line shadow-[3px_3px_0px_0px_rgb(var(--line))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-colors touch-manipulation"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 px-6 py-2 bg-paper hover:bg-sun text-ink font-bold border-2 border-line transition-colors touch-manipulation"
    >
      {children}
    </button>
  );
}
