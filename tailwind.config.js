/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./context/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          cream: "#F5F0E8",
          terracotta: "#B85C3A",
          brown: "#2C1810",
          tan: "#8B7355",
          "cream-dark": "#EDE8DF",
          "terracotta-dark": "#9A4A2E",
          "terracotta-light": "#D4795A",
        },
      },
      fontFamily: {
        // Unified on Manrope: `font-display` (used on headings/accents across
        // the site) now resolves to the same clean sans as the body.
        sans: ["var(--font-manrope)", "system-ui", "Arial", "sans-serif"],
        display: ["var(--font-manrope)", "system-ui", "Arial", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "nav-shimmer": "navShimmer 4s linear infinite",
        // Result-popup motion (courier sync, and anything else that reports
        // the outcome of a background job).
        "pop-in": "popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "draw-check": "drawStroke 0.5s 0.12s ease-out both",
        "draw-cross": "drawStroke 0.35s 0.1s ease-out both",
        "shake": "shake 0.5s 0.2s ease-in-out both",
        "ring-pulse": "ringPulse 1.8s ease-out infinite",
        "rise-in": "riseIn 0.35s ease-out both",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideInRight: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        slideInLeft: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        navShimmer: {
          "0%, 20%":    { backgroundPosition: "120% center" },
          "60%, 100%":  { backgroundPosition: "-120% center" },
        },
        popIn: {
          "0%": { transform: "scale(0.9) translateY(12px)", opacity: "0" },
          "100%": { transform: "scale(1) translateY(0)", opacity: "1" },
        },
        // Pairs with an SVG stroke whose dash array equals its own length, so
        // the tick / cross draws itself instead of just appearing.
        drawStroke: {
          "0%": { strokeDashoffset: "100" },
          "100%": { strokeDashoffset: "0" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-6px)" },
          "40%": { transform: "translateX(5px)" },
          "60%": { transform: "translateX(-3px)" },
          "80%": { transform: "translateX(2px)" },
        },
        ringPulse: {
          "0%": { transform: "scale(0.85)", opacity: "0.55" },
          "70%": { transform: "scale(1.35)", opacity: "0" },
          "100%": { transform: "scale(1.35)", opacity: "0" },
        },
        riseIn: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
