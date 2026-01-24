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
      // Custom color palette
      colors: {
        'primary': {
          'dark': '#78b3ce',
          'light': '#c9e6f0',
          'hover': '#6ba3be',
        },
        'accent': {
          'DEFAULT': '#f96e2a',
          'hover': '#e85d1f',
          'light': '#ff8a5c',
        },
        'bg': {
          'DEFAULT': '#fbf8ef',
          'surface': '#ffffff',
          'alt': '#f5f2e8',
        },
      },
      // Gradient presets
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #78b3ce 0%, #c9e6f0 100%)',
        'gradient-accent': 'linear-gradient(135deg, #f96e2a 0%, #ff8a5c 100%)',
        'gradient-soft': 'linear-gradient(180deg, #fbf8ef 0%, #ffffff 100%)',
      },
      // Shadow presets
      boxShadow: {
        'soft': '0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
        'medium': '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
        'large': '0 8px 24px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.06)',
        'primary': '0 4px 12px rgba(120, 179, 206, 0.3)',
        'accent': '0 4px 12px rgba(249, 110, 42, 0.3)',
      },
    },
  },
  plugins: [],
}
