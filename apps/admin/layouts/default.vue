<script setup lang="ts">
import { useSidebar } from '~/composables/useSidebar'
import Sidebar from '~/components/Sidebar.vue'
import Header from '~/components/Header.vue'

const { isCollapsed, isMobileOpen, closeMobile } = useSidebar()
</script>

<template>
  <div class="min-h-screen flex bg-slate-50 dark:bg-[#0b1220] transition-colors">
    <!-- Desktop Sidebar (Fixed Left with smooth width transition) -->
    <div
      class="hidden lg:block fixed inset-y-0 left-0 z-30 shadow-sm transition-all duration-300 ease-in-out"
      :class="isCollapsed ? 'w-20 overflow-visible' : 'w-64 overflow-hidden'"
    >
      <Sidebar />
    </div>

    <!-- Mobile Drawer Sidebar (Sliding Overlay) -->
    <div
      v-if="isMobileOpen"
      class="lg:hidden fixed inset-0 z-50 flex"
    >
      <!-- Backdrop overlay -->
      <div
        class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        @click="closeMobile"
      ></div>

      <!-- Drawer Content -->
      <div class="relative w-72 max-w-[85vw] h-full shadow-2xl z-10 transition-transform duration-300">
        <Sidebar :is-mobile="true" :on-item-click="closeMobile" />
      </div>
    </div>

    <!-- Main Content Layout (smooth margin/padding transition matching sidebar width) -->
    <div
      class="flex-1 flex flex-col min-w-0 min-h-screen transition-all duration-300 ease-in-out"
      :class="isCollapsed ? 'lg:pl-20' : 'lg:pl-64'"
    >
      <Header />

      <main class="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        <slot />
      </main>
    </div>
  </div>
</template>
