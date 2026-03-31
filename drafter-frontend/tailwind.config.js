/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  safelist: [
    // All custom CSS classes defined in index.css
    'anim-fade-up', 'anim-fade-in', 'anim-slide-left', 'anim-scale-in',
    'anim-spin', 'anim-float', 'anim-pulse',
    'stagger',
    'gradient-text', 'gradient-text-static',
    'sidebar-label',
    'nav-item', 'nav-item active',
    'btn-primary', 'btn-ghost', 'btn-copied',
    'input',
    'bubble-user', 'bubble-ai',
    'typing-dot',
    'tool-badge',
    'stat-chip',
    'format-card', 'selected', 'radio-dot',
    'view-toggle', 'view-tab', 'active',
    'logo-icon',
    'status-dot-on', 'status-dot-off',
    'starter-card',
    'divider',
    'error-banner',
    'orb', 'orb-violet', 'orb-pink',
    'shimmer',
    'doc-surface',
    'prose-doc', 'prose-chat',
    'glass-card',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans:  ['"Geist"', 'system-ui', 'sans-serif'],
        mono:  ['"Geist Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}