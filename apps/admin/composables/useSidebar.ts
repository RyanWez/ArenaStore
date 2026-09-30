export function useSidebar() {
  // Use Nuxt useCookie for SSR-safe persistence across server and client
  const isCollapsed = useCookie<boolean>('arena_sidebar_collapsed', {
    default: () => false,
  })
  const isMobileOpen = useState<boolean>('arena_sidebar_mobile', () => false)

  function toggleCollapse() {
    isCollapsed.value = !isCollapsed.value
    if (import.meta.client) {
      try {
        localStorage.setItem('arena_sidebar_collapsed', String(isCollapsed.value))
      } catch {
        // Ignore storage errors
      }
    }
  }

  function setCollapsed(val: boolean) {
    isCollapsed.value = val
    if (import.meta.client) {
      try {
        localStorage.setItem('arena_sidebar_collapsed', String(val))
      } catch {
        // Ignore storage errors
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
