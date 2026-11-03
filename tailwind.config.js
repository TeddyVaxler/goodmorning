/** @type {import('tailwindcss').Config} */

// Theme colors live as CSS variables in app/globals.css, so dark mode is one swap of values
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    // Boss skin colors and overlay positions live in lib/idle.ts
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: token('ink'), // Text
        line: token('line'), // Borders and hard shadows
        page: token('page'), // Behind everything
        paper: token('paper'), // Cards, panels, buttons
        cream: token('cream'), // Highlighted cards
        glow: token('glow'), // Golden hour panel
        mint: token('mint'), // Good news
        sky: token('sky'), // Streak freeze notice
        honey: token('honey'), // Golden hour score
        teal: token('teal'),
        scrim: token('scrim'), // Behind popups
        // Bright accents look the same in both themes
        night: '#1A2E35', // Light-theme ink, for text on yellow in either theme
        sun: '#F9CB66',
        leaf: '#9FD085',
        lemon: '#fde047',
        marigold: '#F5A800',
        gray: Object.fromEntries([50, 100, 200, 300, 400, 500, 600].map((n) => [n, token(`gray-${n}`)])),
        red: Object.fromEntries([50, 500, 600, 700].map((n) => [n, token(`red-${n}`)])),
      },
      screens: {
        // Phones turned sideways: wide but very short, so the game goes side by side
        short: { raw: '(orientation: landscape) and (max-height: 500px)' },
        // Short portrait screens (small phones, Safari with its toolbars): tighter header
        squat: { raw: '(orientation: portrait) and (max-height: 700px)' },
      },
    },
  },
  plugins: [],
}
