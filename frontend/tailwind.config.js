/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // 🎯 iOS-FIRST RESPONSIVE BREAKPOINTS
      screens: {
        'xs': '375px',   // iPhone SE, 8
        'sm': '390px',   // iPhone 12, 13, 14
        'md': '768px',   // iPad Mini, Portrait
        'lg': '1024px',  // iPad Pro, Landscape
        'xl': '1280px',  // Desktop
      },
      // iOS-style border radius (Apple HIG)
      borderRadius: {
        'ios-sm': '12px',   // Small buttons
        'ios-md': '16px',   // Standard buttons
        'ios-lg': '20px',   // Large cards
        'ios-xl': '24px',   // Bottom sheets
      },
      // Container max-widths for responsive design
      maxWidth: {
        'mobile': '640px',   // Mobile max
        'tablet': '768px',   // Tablet max
        'desktop': '1024px', // Desktop max
      },
      // iOS native font stack
      fontFamily: {
        'ios': ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
