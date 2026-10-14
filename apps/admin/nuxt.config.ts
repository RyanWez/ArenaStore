import { defineNuxtConfig } from 'nuxt/config'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2026-09-30',
  telemetry: false,
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  experimental: {
    appManifest: false,
    asyncContext: true,
  },
  app: {
    head: {
      title: 'Arena Store — Admin Portal',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Arena Store Management & Administration Portal' },
        { name: 'theme-color', content: '#0f172a' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
    layoutTransition: false,
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.API_BASE_URL || process.env.NUXT_PUBLIC_API_URL || 'http://localhost:4000',
      // Sentry DSN — the SDK stays a no-op unless this is non-empty.
      sentry: {
        dsn: process.env.NUXT_PUBLIC_SENTRY_DSN || '',
      },
    },
  },
  nitro: {
    routeRules: {
      '/api/**': {
        proxy: `${(process.env.API_BASE_URL || process.env.NUXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '')}/api/**`,
      },
      '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
      '/logo*.png': { headers: { 'cache-control': 'public, max-age=604800, stale-while-revalidate=86400' } },
      '/favicon*': { headers: { 'cache-control': 'public, max-age=604800, stale-while-revalidate=86400' } },
      '/site.webmanifest': { headers: { 'cache-control': 'public, max-age=86400' } },
    },
  },
  vite: {
    build: {
      cssMinify: true,
      minify: 'esbuild',
    },
  },
  modules: [
    '@nuxtjs/tailwindcss',
    '@sentry/nuxt/module',
  ],
  sentry: {
    // Fully inert build (no SDK wiring, no sourcemap work) unless a DSN is
    // configured at build time. Runtime values are read by
    // sentry.client.config.ts / sentry.server.config.ts.
    enabled: !!process.env.NUXT_PUBLIC_SENTRY_DSN,
  },
  tailwindcss: {
    cssPath: '~/assets/css/main.css',
    configPath: '~/tailwind.config.ts',
  },
  css: [
    'primeicons/primeicons.css',
    '~/assets/css/main.css',
  ],
})
