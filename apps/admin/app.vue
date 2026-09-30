<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useTheme } from '~/composables/useTheme'
import ToastContainer from '~/components/ToastContainer.vue'

const { isDark, initTheme } = useTheme()

onMounted(() => {
  initTheme()
})

useHead({
  htmlAttrs: {
    class: computed(() => (isDark.value ? 'dark' : '')),
  },
})
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0b1220] dark:text-slate-100 transition-colors duration-200">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ToastContainer />
  </div>
</template>
