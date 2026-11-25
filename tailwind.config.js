/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 品牌色走 CSS 变量（rgb 三元组 + alpha-value）：
        // 一键换肤 = 换 :root 上的 --brand-* 变量，全站 brand-* 类自动跟随
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
        },
        // 语义色：成功 / 警示 / 危险，同样走 CSS 变量，深色模式在 index.css 末尾统一适配。
        // 与 brand 一样收编散落的 emerald / amber / rose 硬编码，保证深浅色一致可读。
        ok: {
          50: 'rgb(var(--ok-50) / <alpha-value>)',
          200: 'rgb(var(--ok-200) / <alpha-value>)',
          500: 'rgb(var(--ok-500) / <alpha-value>)',
          600: 'rgb(var(--ok-600) / <alpha-value>)',
          700: 'rgb(var(--ok-700) / <alpha-value>)',
        },
        warn: {
          50: 'rgb(var(--warn-50) / <alpha-value>)',
          200: 'rgb(var(--warn-200) / <alpha-value>)',
          500: 'rgb(var(--warn-500) / <alpha-value>)',
          600: 'rgb(var(--warn-600) / <alpha-value>)',
          700: 'rgb(var(--warn-700) / <alpha-value>)',
        },
        danger: {
          50: 'rgb(var(--danger-50) / <alpha-value>)',
          200: 'rgb(var(--danger-200) / <alpha-value>)',
          500: 'rgb(var(--danger-500) / <alpha-value>)',
          600: 'rgb(var(--danger-600) / <alpha-value>)',
          700: 'rgb(var(--danger-700) / <alpha-value>)',
        },
      },
      boxShadow: {
        card: '0 4px 20px -6px rgb(var(--brand-500) / 0.18)',
      },
      fontSize: {
        // 角标 / 时间戳等弱提示统一 11px：归并全站散落的 text-[10px] / text-[11px]
        '2xs': ['11px', { lineHeight: '16px' }],
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
        confetti: {
          '0%': { transform: 'translateY(-12vh) rotate(0deg)', opacity: '1' },
          '85%': { opacity: '1' },
          '100%': { transform: 'translateY(112vh) rotate(540deg)', opacity: '0' },
        },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        wiggle: {
          '0%,100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-6deg)' },
          '75%': { transform: 'rotate(6deg)' },
        },
        // 底部导航液滴的落地回弹：纵向挤压再回弹，像水滴先砸到再稳住
        // （只用 scaleY，避免与滑块的 translateX 合并冲突）
        'nav-drop': {
          '0%': { transform: 'scaleY(0.75)', opacity: '0.6' },
          '55%': { transform: 'scaleY(1.08)', opacity: '1' },
          '100%': { transform: 'scaleY(1)', opacity: '1' },
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
        confetti: 'confetti 2.8s linear forwards',
        shimmer: 'shimmer 1.6s linear infinite',
        wiggle: 'wiggle .5s ease-in-out',
        'nav-drop': 'nav-drop .34s cubic-bezier(.34,1.4,.64,1) both',
      },
    },
  },
  plugins: [],
}
