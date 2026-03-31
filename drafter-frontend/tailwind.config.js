/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ink: {
          950: '#0d0d0d',
          900: '#1a1a1a',
          800: '#2a2a2a',
          700: '#3a3a3a',
          600: '#555555',
          400: '#888888',
          200: '#cccccc',
          100: '#e8e8e8',
          50: '#f5f5f5',
        },
        parchment: {
          DEFAULT: '#faf7f2',
          dark: '#f0ebe0',
          border: '#e0d8cc',
        },
        amber: {
          accent: '#c97d2e',
          soft: '#f5e6cc',
        },
        jade: '#2d6a4f',
        crimson: '#8b1a1a',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease forwards',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
