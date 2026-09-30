<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from '~/components/Sidebar.vue'
import Header from '~/components/Header.vue'

const mobileSidebarOpen = ref(false)

function toggleMobileSidebar() {
  mobileSidebarOpen.value = !mobileSidebarOpen.value
}

function closeMobileSidebar() {
  mobileSidebarOpen.value = false
}
</script>

<template>
  <div class="min-h-screen flex bg-slate-50 dark:bg-[#0b1220] transition-colors">
    <!-- Desktop Sidebar (Fixed Left) -->
    <div class="hidden lg:block fixed inset-y-0 left-0 w-64 z-30 shadow-sm">
      <Sidebar />
    </div>

    <!-- Mobile Drawer Sidebar (Sliding Overlay) -->
    <div
      v-if="mobileSidebarOpen"
      class="lg:hidden fixed inset-0 z-50 flex"
    >
      <!-- Backdrop overlay -->
      <div
        class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        @click="closeMobileSidebar"
      ></div>

      <!-- Drawer Content -->
      <div class="relative w-72 max-w-[80vw] h-full shadow-2xl z-10">
        <Sidebar :on-item-click="closeMobileSidebar" />
      </div>
    </div>

    <!-- Main Content Layout -->
    <div class="flex-1 lg:pl-64 flex flex-col min-w-0 min-h-screen">
      <Header @toggle-mobile-sidebar="toggleMobileSidebar" />

      <main class="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        <slot />
      </main>
    </div>
  </div>
</template>
