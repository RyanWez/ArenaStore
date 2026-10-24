<script setup lang="ts">
import { Search, Bell } from "lucide-vue-next";
import DashboardSidebar from "~/components/dashboard/DashboardSidebar.vue";
import TheBottomNav from "~/components/TheBottomNav.vue";
import AuthChallengeModal from "~/components/AuthChallengeModal.vue";
import { useStoreAuth } from "~/composables/useStoreAuth";

const { user, isAuthenticated, fetchMe, initTelegramMiniApp, openLoginModal } = useStoreAuth();

onMounted(async () => {
  const isMiniApp = await initTelegramMiniApp();
  if (!isMiniApp) {
    await fetchMe();
  }
});

const handleOpenTopup = () => {
  console.log("[Dashboard Layout] Top-Up triggered");
};
</script>

<template>
  <div class="min-h-screen bg-arena-bg text-arena-text flex flex-col lg:flex-row font-sans">
    <!-- 1. DESKTOP LEFT SIDEBAR (>= 1024px) -->
    <DashboardSidebar
      class="hidden lg:flex sticky top-0 h-screen"
      @open-topup="handleOpenTopup"
    />

    <!-- 2. MOBILE TOP APP BAR (< 1024px) matching mobile_dashboard.png -->
    <header class="lg:hidden sticky top-0 z-40 flex h-16 items-center justify-between border-b border-arena-border/70 bg-arena-bg/95 px-4 sm:px-6 backdrop-blur-md">
      <!-- Left: Logo + Tagline -->
      <NuxtLink to="/" class="flex items-center space-x-2.5">
        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-black font-black text-xs shadow-sm">
          <svg class="h-4 w-4 fill-current text-black" viewBox="0 0 24 24">
            <path d="M12 2L2 22h4.5l2.5-5.5h6l2.5 5.5H22L12 2zm0 5.8l2.1 4.7H9.9L12 7.8z" />
          </svg>
        </div>
        <div>
          <div class="text-sm font-extrabold tracking-tight text-white leading-none">
            Arena Store
          </div>
          <div class="text-[8px] font-bold uppercase tracking-widest text-arena-muted mt-0.5">
            Digital Goods For A Better You
          </div>
        </div>
      </NuxtLink>

      <!-- Right: Notification Bell with Unread Dot -->
      <button
        type="button"
        class="relative flex h-9 w-9 items-center justify-center rounded-full text-arena-muted hover:text-white transition-colors"
        title="Notifications"
      >
        <Bell class="h-4 w-4" />
        <span class="absolute top-2 right-2 h-2 w-2 rounded-full bg-arena-orange ring-2 ring-arena-bg" />
      </button>
    </header>

    <!-- 3. MAIN DASHBOARD CONTENT AREA -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Desktop Top Search Bar (>= 1024px) matching desktop_dashboard.png -->
      <header class="hidden lg:flex h-16 items-center justify-between border-b border-arena-border/70 px-8 bg-arena-bg/80 backdrop-blur-md sticky top-0 z-30">
        <!-- Search Input with ⌘K Badge -->
        <div class="relative w-80">
          <div class="relative flex items-center rounded-full border border-arena-border bg-[#0E1015] px-3.5 py-1.5 focus-within:border-arena-border-strong transition-colors">
            <Search class="h-3.5 w-3.5 text-arena-muted mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search games, top ups, keys..."
              class="w-full bg-transparent text-xs text-white placeholder-arena-subtle focus:outline-none"
            />
            <kbd class="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-arena-muted">
              ⌘ K
            </kbd>
          </div>
        </div>

        <!-- Right Side: Notification Bell + User Profile Chip or Login button -->
        <div class="flex items-center space-x-4">
          <!-- Notification Bell -->
          <button
            type="button"
            class="relative flex h-9 w-9 items-center justify-center rounded-full text-arena-muted hover:text-white transition-colors"
          >
            <Bell class="h-4 w-4" />
            <span class="absolute top-2 right-2 h-2 w-2 rounded-full bg-arena-orange ring-2 ring-arena-bg" />
          </button>

          <!-- User Profile Pill (When authenticated) -->
          <template v-if="isAuthenticated && user">
            <NuxtLink
              to="/profile"
              class="flex items-center space-x-2.5 rounded-full border border-arena-border bg-arena-surface/80 hover:bg-arena-elevated px-3 py-1.5 transition-colors"
            >
              <div class="flex h-6 w-6 items-center justify-center rounded-full bg-arena-hover text-xs font-bold text-arena-orange uppercase border border-arena-border">
                {{ user.firstName?.charAt(0) || "U" }}
              </div>
              <div class="text-left text-xs leading-none">
                <div class="font-bold text-white uppercase">{{ user.firstName }}</div>
                <div class="text-[9px] text-arena-muted mt-0.5">Member since 2026</div>
              </div>
            </NuxtLink>
          </template>

          <!-- Guest Login Trigger (When unauthenticated) -->
          <template v-else>
            <button
              type="button"
              @click="openLoginModal()"
              class="flex items-center space-x-2 rounded-full bg-arena-orange hover:bg-arena-orange-hover px-4 py-1.5 text-xs font-bold text-white transition-all shadow-sm"
            >
              <span>Log in with Telegram</span>
            </button>
          </template>
        </div>
      </header>

      <!-- Page Content Viewport -->
      <main class="flex-1 p-4 sm:p-6 lg:p-8 pb-28 md:pb-28 lg:pb-12 max-w-7xl w-full mx-auto">
        <slot />
      </main>
    </div>

    <!-- 4. MOBILE FROSTED BOTTOM NAVIGATION (< 1024px) -->
    <TheBottomNav class="lg:hidden" />

    <!-- 5. Telegram Challenge Handshake Modal -->
    <AuthChallengeModal />
  </div>
</template>
