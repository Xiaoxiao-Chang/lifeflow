/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        phone: '0 24px 80px rgba(15, 23, 42, 0.18)',
        soft: '0 10px 30px rgba(15, 23, 42, 0.08)',
      },
      colors: {
        ink: '#172033',
        mist: '#f6f8fb',
        leaf: '#15a46f',
        coral: '#f26c5b',
        sun: '#f7b955',
      },
    },
  },
  plugins: [],
};
