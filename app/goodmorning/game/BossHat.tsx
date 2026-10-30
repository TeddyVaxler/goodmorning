"use client";

import { memo } from 'react';
import { RUSH_TIME_ZONE } from '@/lib/rush';

// Seasonal hats drawn on top of the boss's head. The season follows the Central calendar date.

export type Season = 'halloween' | 'thanksgiving' | 'christmas' | 'newyear' | 'valentines' | 'stpatricks' | 'july4';

export const SEASON_NAMES: Record<Season, string> = {
  halloween: 'Halloween',
  thanksgiving: 'Thanksgiving',
  christmas: 'Christmas',
  newyear: "New Year's",
  valentines: "Valentine's Day",
  stpatricks: "St. Patrick's Day",
  july4: 'Fourth of July',
};

const centralDate = new Intl.DateTimeFormat('en-CA', { timeZone: RUSH_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

// US Thanksgiving: the fourth Thursday of November
function thanksgivingDay(year: number) {
  const firstWeekday = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0 = Sunday
  const firstThursday = 1 + ((4 - firstWeekday + 7) % 7);
  return firstThursday + 21;
}

export function seasonFor(now = new Date()): Season | null {
  const [year, month, day] = centralDate.format(now).split('-').map(Number);
  if (month === 10) return 'halloween';
  if (month === 11) return day <= thanksgivingDay(year) ? 'thanksgiving' : 'christmas';
  if (month === 12) return day <= 26 ? 'christmas' : 'newyear';
  if (month === 1 && day <= 2) return 'newyear';
  if (month === 2 && day <= 14) return 'valentines';
  if (month === 3 && day >= 10 && day <= 17) return 'stpatricks';
  if ((month === 6 && day >= 28) || (month === 7 && day <= 4)) return 'july4';
  return null;
}

const INK = '#1A2E35';

const HATS: Record<Season, React.ReactNode> = {
  // Pointy witch hat with a purple band and gold buckle
  halloween: (
    <>
      <path d="M50 2 C58 18 66 34 70 50 L30 50 C36 32 42 18 50 2 Z" fill="#2b1b3d" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M50 2 C46 6 40 6 36 12" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <rect x="31" y="42" width="38" height="8" fill="#7c3aed" stroke={INK} strokeWidth="2" />
      <rect x="45" y="41" width="10" height="10" fill="none" stroke="#F9CB66" strokeWidth="2.5" />
      <ellipse cx="50" cy="54" rx="46" ry="8" fill="#2b1b3d" stroke={INK} strokeWidth="2.5" />
    </>
  ),
  // Black pilgrim hat with a gold buckle
  thanksgiving: (
    <>
      <path d="M30 14 L70 14 L74 52 L26 52 Z" fill="#1f1f1f" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="27" y="38" width="46" height="9" fill="#5b3a1e" stroke={INK} strokeWidth="2" />
      <rect x="43" y="36" width="14" height="13" fill="none" stroke="#F9CB66" strokeWidth="3" />
      <ellipse cx="50" cy="55" rx="44" ry="7" fill="#1f1f1f" stroke={INK} strokeWidth="2.5" />
    </>
  ),
  // Floppy red Santa hat with white trim and pom-pom
  christmas: (
    <>
      <path d="M22 50 C24 26 40 8 60 8 C72 8 82 16 86 30 C80 24 72 22 66 26 C74 34 76 42 76 50 Z" fill="#dc2626" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="16" y="46" width="68" height="13" rx="6.5" fill="#ffffff" stroke={INK} strokeWidth="2.5" />
      <circle cx="87" cy="33" r="8" fill="#ffffff" stroke={INK} strokeWidth="2.5" />
    </>
  ),
  // Striped party cone with a pom-pom
  newyear: (
    <>
      <path d="M50 4 L72 54 L28 54 Z" fill="#facc15" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M41 24 L59 24 M36 36 L64 36 M32 47 L68 47" stroke="#7c3aed" strokeWidth="5" />
      <path d="M50 4 L72 54 L28 54 Z" fill="none" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="50" cy="5" r="6" fill="#ec4899" stroke={INK} strokeWidth="2.5" />
    </>
  ),
  // Headband with two heart boppers
  valentines: (
    <>
      <path d="M34 50 L30 22 M66 50 L70 22" stroke={INK} strokeWidth="2.5" />
      <path d="M30 26 C22 18 14 26 22 34 L30 42 L38 34 C46 26 38 18 30 26 Z" fill="#ef4444" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" transform="translate(0 -14)" />
      <path d="M70 26 C62 18 54 26 62 34 L70 42 L78 34 C86 26 78 18 70 26 Z" fill="#f472b6" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" transform="translate(0 -14)" />
      <path d="M14 56 C30 44 70 44 86 56" fill="none" stroke="#ef4444" strokeWidth="7" strokeLinecap="round" />
    </>
  ),
  // Green leprechaun top hat with a shamrock
  stpatricks: (
    <>
      <path d="M32 12 L68 12 L72 50 L28 50 Z" fill="#16a34a" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="29" y="38" width="42" height="8" fill="#1f1f1f" stroke={INK} strokeWidth="2" />
      <rect x="45" y="36" width="10" height="12" fill="none" stroke="#F9CB66" strokeWidth="2.5" />
      <g fill="#4ade80" stroke={INK} strokeWidth="1.5">
        <circle cx="62" cy="24" r="4" /><circle cx="68" cy="24" r="4" /><circle cx="65" cy="19" r="4" />
      </g>
      <ellipse cx="50" cy="54" rx="44" ry="7" fill="#16a34a" stroke={INK} strokeWidth="2.5" />
    </>
  ),
  // Uncle Sam stars-and-stripes top hat
  july4: (
    <>
      <path d="M32 6 L68 6 L70 50 L30 50 Z" fill="#ffffff" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M38 6 L37 50 M50 6 L50 50 M62 6 L63 50" stroke="#dc2626" strokeWidth="5" />
      <rect x="30" y="38" width="40" height="9" fill="#1d4ed8" stroke={INK} strokeWidth="2" />
      <g fill="#ffffff"><circle cx="40" cy="42.5" r="1.8" /><circle cx="50" cy="42.5" r="1.8" /><circle cx="60" cy="42.5" r="1.8" /></g>
      <path d="M32 6 L68 6 L70 50 L30 50 Z" fill="none" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="50" cy="54" rx="42" ry="7" fill="#1d4ed8" stroke={INK} strokeWidth="2.5" />
    </>
  ),
};

// Sits on top of the boss circle: place it inside a `relative` box the same size as the circle
export default memo(function BossHat({ season }: { season: Season }) {
  return (
    <svg
      viewBox="0 0 100 62"
      aria-label={`${SEASON_NAMES[season]} hat`}
      role="img"
      className="absolute left-1/2 -translate-x-1/2 -top-[27%] w-[72%] z-20 pointer-events-none drop-shadow-[2px_2px_0_rgba(26,46,53,0.35)]"
    >
      {HATS[season]}
    </svg>
  );
});
