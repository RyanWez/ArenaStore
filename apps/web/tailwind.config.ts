import type { Config } from "tailwindcss";

export default <Partial<Config>>{
  darkMode: "class",
  content: [
    "./components/**/*.{vue,js,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./composables/**/*.{js,ts}",
    "./app.{js,ts,vue}",
  ],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: "#08090B",
          surface: "#101216",
          elevated: "#161920",
          hover: "#1C202A",
          border: "#1F232D",
          "border-strong": "#2F3545",
          orange: "#FF5A1F",
          "orange-hover": "#FF6E38",
          "orange-subtle": "rgba(255, 90, 31, 0.12)",
          text: "#F4F5F7",
          muted: "#8B92A4",
          subtle: "#5A6173",
          emerald: "#10B981",
          danger: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "'Noto Sans Myanmar'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
        burmese: ["'Noto Sans Myanmar'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "flat-border": "0 0 0 1px #1F232D",
        "flat-orange": "0 0 0 1px #FF5A1F",
        "card": "0 4px 20px -2px rgba(0, 0, 0, 0.5)",
      },
    },
  },
  plugins: [],
};
