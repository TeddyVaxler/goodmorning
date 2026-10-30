/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        // Phones turned sideways: wide but very short, so the game goes side by side
        short: { raw: '(orientation: landscape) and (max-height: 500px)' },
      },
    },
  },
  plugins: [],
}