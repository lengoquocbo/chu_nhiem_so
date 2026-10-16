/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F6F8",
        ink: {
          DEFAULT: "#1B1F27",
          muted: "#6B7280",
          faint: "#9AA1AC",
        },
        navy: {
          DEFAULT: "#1E2A4A",
          light: "#2C3B63",
          dark: "#141D33",
        },
        add: {
          DEFAULT: "#2F7B5C",
          bg: "#E9F3EE",
        },
        deduct: {
          DEFAULT: "#B3453B",
          bg: "#F8ECEA",
        },
        gold: {
          DEFAULT: "#C08A2E",
          bg: "#FBF1DE",
        },
        line: "#E2E4E9",
      },
      fontFamily: {
        serif: ["var(--font-lora)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        lg: "10px",
        full: "9999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(30, 42, 74, 0.06)",
      },
    },
  },
  plugins: [],
};
