import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class', // 启用基于 class 的暗黑模式
  content: [
    './index.html',
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Canvas Design System - 字体配置
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
        ui: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
      },
      // Canvas Design System - 颜色配置
      colors: {
        canvas: '#FAFAF9',
        'canvas-dark': '#18181b', // 暗黑模式背景
        stone: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
          950: '#0c0a09', // 暗黑模式更深的色调
        },
        'aurora-pink': '#FF6B9D',
        'aurora-purple': 'rgb(var(--aurora-purple) / <alpha-value>)',
        'aurora-blue': '#60A5FA',
        'aurora-green': '#34D399',
      },
      // Canvas Design System - 圆角配置
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        'full': '9999px',
      },
      // Canvas Design System - 投影配置
      boxShadow: {
        canvas: '0 4px 24px rgba(0, 0, 0, 0.06)',
        'canvas-lg': '0 8px 32px rgba(0, 0, 0, 0.08)',
        'canvas-xl': '0 12px 48px rgba(0, 0, 0, 0.1)',
        'canvas-dark': '0 4px 24px rgba(0, 0, 0, 0.3)', // 暗黑模式投影
        'canvas-dark-lg': '0 8px 32px rgba(0, 0, 0, 0.4)',
        aurora: '0 8px 32px rgb(var(--aurora-shadow) / 0.18)',
        'aurora-lg': '0 12px 48px rgb(var(--aurora-shadow) / 0.24)',
        soft: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        float: '0 20px 40px -10px rgba(0, 0, 0, 0.08)',
        glow: '0 0 20px rgb(var(--aurora-shadow) / 0.4)',
      },
      // Canvas Design System - 渐变背景
      backgroundImage: {
        'gradient-aurora': 'linear-gradient(135deg, #FF6B9D 0%, rgb(var(--aurora-purple) / 1) 50%, #60A5FA 100%)',
        'gradient-aurora-light': 'linear-gradient(135deg, rgb(220 200 255 / 20%) 0%, rgb(255 200 230 / 20%) 50%, rgb(255 214 180 / 10%) 100%)',
        'gradient-aurora-dark': 'linear-gradient(135deg, rgb(139 92 246 / 15%) 0%, rgb(236 72 153 / 15%) 50%, rgb(59 130 246 / 10%) 100%)', // 暗黑模式渐变
      },
      // Canvas Design System - 动画配置
      animation: {
        aurora: 'aurora 8s ease-in-out infinite',
        blob: 'blob 10s infinite',
        float: 'float 6s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'text-fade-in': 'textFadeIn 0.15s ease-out forwards',
        'modal-in': 'modalIn 0.3s ease-out',
        shake: 'shake 0.5s ease-in-out',
      },
      keyframes: {
        aurora: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        blob: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        textFadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        modalIn: {
          '0%': { opacity: '0', transform: 'translate(-50%, -48%) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        },
      },
      // Canvas Design System - 过渡时长
      transitionDuration: {
        '300': '300ms',
        '500': '500ms',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
}

export default config
