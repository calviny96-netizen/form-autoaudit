import { heroui } from "@heroui/react";
export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./node_modules/@heroui/**/theme/dist/**/*.{js,mjs,ts,jsx,tsx}",
  ],
  theme: { extend: {} },
  plugins: [
    heroui({
      themes: {
        light: {
          colors: {
            primary: { DEFAULT: "#0369A1", foreground: "#fff" },
            success: { DEFAULT: "#15803D", foreground: "#fff" },
          },
        },
      },
    }),
  ],
};
