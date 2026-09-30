import { computed } from 'vue'

export function useTheme() {
  const isDark = useState<boolean>('arena_theme_is_dark', () => true)

  function applyTheme(dark: boolean) {
    isDark.value = dark
    if (import.meta.client) {
      if (dark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      try {
        localStorage.setItem('arena_theme', dark ? 'dark' : 'light')
      } catch {
        // LocalStorage fallback
      }
    }
  }

  function toggleTheme() {
    applyTheme(!isDark.value)
  }

  function initTheme() {
    if (import.meta.client) {
      try {
        const stored = localStorage.getItem('arena_theme')
        if (stored === 'light') {
          applyTheme(false)
        } else {
          applyTheme(true)
        }
      } catch {
        applyTheme(true)
      }
    }
  }

  return {
    isDark,
    toggleTheme,
    applyTheme,
    initTheme,
  }
}
