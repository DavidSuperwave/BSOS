/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Blitzscale Brand Colors
        obsidian: {
          50: '#f4f5f4',
          100: '#e3e6e3',
          200: '#c7ccc7',
          300: '#a3aba3',
          400: '#7a857a',
          500: '#344532',
          600: '#2d3b2b',
          700: '#253125',
          800: '#1e271e',
          900: '#161f16',
        },
        accent: {
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
          blue: '#3b82f6',
          violet: '#8b5cf6',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
