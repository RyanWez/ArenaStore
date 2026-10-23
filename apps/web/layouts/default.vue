<script setup lang="ts">
import TheHeader from "~/components/TheHeader.vue";
import TheBottomNav from "~/components/TheBottomNav.vue";
import { useStoreAuth } from "~/composables/useStoreAuth";

const { fetchMe, initTelegramMiniApp } = useStoreAuth();

onMounted(async () => {
  // First attempt zero-click auto-login if launched inside Telegram Mini App
  const isMiniApp = await initTelegramMiniApp();
  // Otherwise check active browser cookie session
  if (!isMiniApp) {
    await fetchMe();
  }
});

const handleOpenLogin = () => {
  // Dispatches event or opens 4-digit challenge modal (Sub-Phase 2C)
  console.log("[Storefront] Open Login Modal triggered");
};

const handleOpenTopup = () => {
  console.log("[Storefront] Open Top-Up Modal triggered");
};
</script>

<template>
  <div class="min-h-screen bg-arena-bg text-arena-text flex flex-col font-sans">
    <!-- Sticky Header -->
    <TheHeader
      @open-login="handleOpenLogin"
      @open-topup="handleOpenTopup"
    />

    <!-- Main Viewport Slot -->
    <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12">
      <slot />
    </main>

    <!-- Mobile Frosted Glass Navigation Bar -->
    <TheBottomNav />
  </div>
</template>
