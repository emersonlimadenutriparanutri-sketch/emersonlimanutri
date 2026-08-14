/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: {
          50: '#f2f6ef',
          100: '#e2ecdb',
          200: '#c6d9b9',
          300: '#a2c08d',
          400: '#7ea564',
          500: '#5f8a46',
          600: '#4a6e35',
          700: '#3b5a2e',
          800: '#314826',
          900: '#293c21',
        },
        areia: {
          50: '#faf8f4',
          100: '#f3efe6',
          200: '#e7dfcd',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
