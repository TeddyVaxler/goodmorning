'use client';

import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { type Theme, THEME_STORAGE_KEY } from '@/lib/theme';

const OPTIONS: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: 'system', label: 'Auto', Icon: Monitor },
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
];

const listeners = new Set<() => void>();

function readTheme(): Theme {
  const theme = document.documentElement.dataset.theme;
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  listeners.forEach((notify) => notify());
}

function setTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode: the choice still applies until the tab closes
  }
  applyTheme(theme);
}

// Picking a theme in another tab updates this one too
function onStorage(e: StorageEvent) {
  if (e.key !== THEME_STORAGE_KEY && e.key !== null) return;
  applyTheme(e.newValue === 'light' || e.newValue === 'dark' ? e.newValue : 'system');
}

function subscribe(notify: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

// Auto follows the device's dark mode setting
export default function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'system' as Theme);

  return (
    <div role="radiogroup" aria-label="Theme" className="flex border-2 border-line text-xs font-black uppercase">
      {OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button" // Also lives inside the profile form
          role="radio"
          aria-checked={theme === id}
          onClick={() => setTheme(id)}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 touch-manipulation ${
            theme === id ? 'bg-ink text-paper' : 'bg-paper hover:bg-cream'
          }`}
        >
          <Icon className="w-3.5 h-3.5 shrink-0" />
          {label}
        </button>
      ))}
    </div>
  );
}
