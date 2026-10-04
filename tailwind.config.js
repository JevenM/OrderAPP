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
      keyframes: {
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-down': {
          from: { opacity: '0', transform: 'translateY(-12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(.94)' },
          '60%': { opacity: '1', transform: 'scale(1.02)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        heart: { '0%': { transform: 'scale(1)' }, '45%': { transform: 'scale(1.35)' }, '100%': { transform: 'scale(1)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        wiggle: {
          '0%,100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-6deg)' },
          '75%': { transform: 'rotate(6deg)' },
        },
      },
      animation: {
        fade: 'fade .28s ease-out both',
        page: 'fade-up .34s cubic-bezier(.22,1,.36,1) both',
        'fade-up': 'fade-up .34s cubic-bezier(.22,1,.36,1) both',
        'fade-down': 'fade-down .26s ease-out both',
        'slide-up': 'slide-up .34s cubic-bezier(.22,1,.36,1) both',
        'pop-in': 'pop-in .26s cubic-bezier(.22,1,.36,1) both',
        float: 'float 3.6s ease-in-out infinite',
        heart: 'heart .45s ease-out',
        shimmer: 'shimmer 1.6s linear infinite',
        wiggle: 'wiggle .5s ease-in-out',
      },
    },
  },
  plugins: [],
}
