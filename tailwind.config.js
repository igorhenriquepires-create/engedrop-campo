/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#effaf4', 100: '#d7f4e2', 200: '#b2e9c8', 300: '#79d6a0', 400: '#3fbd76', 500: '#109658', 600: '#087443', 700: '#075c37', 800: '#064a30', 900: '#063b28' }
      },
      boxShadow: { soft: '0 8px 30px rgba(7, 92, 55, .08)' }
    }
  },
  plugins: []
}
