/** @type {import('tailwindcss').Config} */
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