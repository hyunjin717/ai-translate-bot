/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: { popover: '#1e1e1e', window: '#252525', surface: '#2d2d2d' },
        border: '#3a3a3a',
        accent: { DEFAULT: '#007AFF', hover: '#0066D6' },
        semantic: {
          success: '#30D158',
          warning: '#FFD60A',
          error: '#FF453A',
          info: '#007AFF'
        }
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'monospace']
      },
      fontSize: {
        '2xs': '10px',
        xs: '11px',
        sm: '12px',
        base: '14px',
        lg: '16px',
        xl: '18px',
        '2xl': '24px'
      },
      spacing: {
        '2xs': '2px',
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '32px',
        '3xl': '48px'
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px'
      }
    }
  },
  plugins: []
}
