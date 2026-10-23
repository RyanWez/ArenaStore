import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  ssr: true,
  telemetry: false,
  compatibilityDate: "2026-10-24",
  future: {
    compatibilityVersion: 4,
  },
  devtools: { enabled: process.env.NODE_ENV !== "production" },
  experimental: {
    viewTransition: true,
  },
  css: ["~/assets/css/main.css"],
  modules: ["@nuxtjs/tailwindcss"],
  nitro: {
    routeRules: {
      "/api/**": {
        proxy: `${(process.env.API_BASE_URL || "http://localhost:4000").replace(/\/+$/, "")}/api/**`,
      },
    },
  },
  app: {
    head: {
      title: "Arena Store — Digital Accounts & Subscriptions",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: "#08090B" },
        { name: "description", content: "Arena Store — Premium digital accounts, licenses and subscriptions with instant MMK wallet checkout." },
      ],
      link: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Noto+Sans+Myanmar:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
        },
      ],
      script: [
        { src: "https://telegram.org/js/telegram-web-app.js", defer: true },
      ],
    },
    pageTransition: { name: "page", mode: "out-in" },
  },
});
