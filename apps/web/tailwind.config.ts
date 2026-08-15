import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0f14",
        panel: "#121821",
        border: "#232c38",
        muted: "#8291a3",
      },
    },
  },
  plugins: [],
};

export default config;
