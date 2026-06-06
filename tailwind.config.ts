import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: { DEFAULT: '#D4AF37', muted: '#9c7f1e', bright: '#f0c840' },
        bg: { base: '#0a0a0f', card: '#12121a', panel: '#1a1a26', hover: '#22223a' },
        border: { subtle: '#2a2a3f', accent: '#D4AF37' },
        status: {
          ok: '#22c55e',
          warn: '#f59e0b',
          error: '#ef4444',
          unknown: '#6b7280',
        },
        text: {
          primary: '#ffffff',
          secondary: '#a0a0b8',
          muted: '#5a5a78',
        },
      },
      fontFamily: { sans: ['var(--font-inter)', 'sans-serif'] },
    },
  },
  plugins: [],
}

export default config
