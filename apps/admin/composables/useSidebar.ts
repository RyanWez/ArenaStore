import { ref } from 'vue'

const isCollapsed = ref(false)
const isMobileOpen = ref(false)

export function useSidebar() {
  // Initialize from localStorage on client side
  if (import.meta.client) {
    try {
      const saved = localStorage.getItem('arena_sidebar_collapsed')
      if (saved !== null) {
        isCollapsed.value = saved === 'true'
      }
    } catch {
      // Ignore localStorage read errors
    }
  }

  function toggleCollapse() {
    isCollapsed.value = !isCollapsed.value
    if (import.meta.client) {
      try {
        localStorage.setItem('arena_sidebar_collapsed', String(isCollapsed.value))
      } catch {
        // Ignore localStorage write errors
      }
    }
  }

  function setCollapsed(val: boolean) {
    isCollapsed.value = val
    if (import.meta.client) {
      try {
        localStorage.setItem('arena_sidebar_collapsed', String(val))
      } catch {
        // Ignore localStorage write errors
      }
    }
  }

  function toggleMobile() {
    isMobileOpen.value = !isMobileOpen.value
  }

  function closeMobile() {
    isMobileOpen.value = false
  }

  function openMobile() {
    isMobileOpen.value = true
  }

  return {
    isCollapsed,
    isMobileOpen,
    toggleCollapse,
    setCollapsed,
    toggleMobile,
    closeMobile,
    openMobile,
  }
}
