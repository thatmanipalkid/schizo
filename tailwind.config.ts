import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: "#0F766E",
        ink: "#171717",
        muted: "#525252",
        line: "#E5E5E5",
      },
    },
  },
  plugins: [],
};

export default config;
