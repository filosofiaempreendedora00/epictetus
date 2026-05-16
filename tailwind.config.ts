import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0e1a",
          panel: "#0f1420",
          card: "#ffffff",
        },
        column: {
          blue: "#2c7cb0",
          azure: "#3aacd9",
          cyan: "#4dd0ce",
          teal: "#5fe0b7",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
