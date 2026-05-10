import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Pure monochrome palette
        surface: {
          DEFAULT: "#000000",
          card: "#0d0d0d",
          border: "#1a1a1a",
          muted: "#2a2a2a",
        },
      },
      fontFamily: {
        mono: ["'SF Mono'", "'Fira Code'", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
