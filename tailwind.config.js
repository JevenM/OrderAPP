/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff1f5',
          100: '#ffe4ec',
          200: '#fecdd9',
          300: '#fda4bd',
          400: '#fb7197',
          500: '#f43f70',
          600: '#e11d51',
          700: '#be123c',
        },
      },
      boxShadow: {
        card: '0 4px 20px -6px rgba(244, 63, 112, 0.18)',
      },
    },
  },
  plugins: [],
}
