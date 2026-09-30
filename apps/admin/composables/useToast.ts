import { ref } from 'vue'

export interface ToastMessage {
  id: string
  title: string
  message: string
  type: 'success' | 'error' | 'warn' | 'info'
  duration?: number
}

const toasts = ref<ToastMessage[]>([])

export function useToast() {
  function showToast(options: Omit<ToastMessage, 'id'>) {
    const id = Math.random().toString(36).substring(2, 9)
    const duration = options.duration ?? 4000
    const newToast: ToastMessage = { ...options, id, duration }

    toasts.value.push(newToast)

    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id)
      }, duration)
    }

    return id
  }

  function dismissToast(id: string) {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) {
      toasts.value.splice(idx, 1)
    }
  }

  function success(message: string, title = 'Success') {
    return showToast({ type: 'success', title, message })
  }

  function error(message: string, title = 'Error') {
    return showToast({ type: 'error', title, message })
  }

  function warn(message: string, title = 'Notice') {
    return showToast({ type: 'warn', title, message })
  }

  function info(message: string, title = 'Information') {
    return showToast({ type: 'info', title, message })
  }

  return {
    toasts,
    showToast,
    dismissToast,
    success,
    error,
    warn,
    info,
  }
}
