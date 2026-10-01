<script setup lang="ts">
import { useToast } from '~/composables/useToast'

const { toasts, dismissToast } = useToast()

function runToastAction(toastId: string) {
  const toast = toasts.value.find(t => t.id === toastId)
  toast?.action?.handler()
  dismissToast(toastId)
}
</script>

<template>
  <div class="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
    <TransitionGroup
      enter-active-class="transform ease-out duration-300 transition"
      enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-4"
      enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto relative overflow-hidden flex items-start gap-3 p-4 rounded-2xl shadow-xl backdrop-blur-md border text-xs transition-all"
        :class="{
          'bg-emerald-950/90 text-emerald-200 border-emerald-500/30 shadow-emerald-900/20': toast.type === 'success',
          'bg-rose-950/90 text-rose-200 border-rose-500/30 shadow-rose-900/20': toast.type === 'error',
          'bg-amber-950/90 text-amber-200 border-amber-500/30 shadow-amber-900/20': toast.type === 'warn',
          'bg-slate-900/90 text-slate-200 border-slate-700/60 shadow-slate-950/40': toast.type === 'info',
        }"
      >
        <!-- Icon -->
        <div class="mt-0.5 shrink-0">
          <i
            v-if="toast.type === 'success'"
            class="pi pi-check-circle text-base text-emerald-400"
          ></i>
          <i
            v-else-if="toast.type === 'error'"
            class="pi pi-times-circle text-base text-rose-400"
          ></i>
          <i
            v-else-if="toast.type === 'warn'"
            class="pi pi-exclamation-triangle text-base text-amber-400"
          ></i>
          <i
            v-else
            class="pi pi-info-circle text-base text-indigo-400"
          ></i>
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <p class="font-bold text-white text-[13px] tracking-tight">
            {{ toast.title }}
          </p>
          <p class="mt-0.5 text-slate-300 leading-relaxed break-words">
            {{ toast.message }}
          </p>
          <button
            v-if="toast.action"
            type="button"
            @click="runToastAction(toast.id)"
            class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-[11px] transition-colors active:scale-95"
          >
            <i class="pi pi-replay text-[10px]"></i>
            {{ toast.action.label }}
          </button>
        </div>

        <!-- Close button -->
        <button
          type="button"
          @click="dismissToast(toast.id)"
          class="shrink-0 p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          title="Dismiss"
        >
          <i class="pi pi-times text-xs"></i>
        </button>

        <!-- Auto-dismiss countdown bar -->
        <span
          v-if="toast.duration && toast.duration > 0"
          class="absolute bottom-0 left-0 h-0.5 bg-white/20 rounded-full"
          :style="{ animation: `toast-countdown ${toast.duration}ms linear forwards` }"
        ></span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
@keyframes toast-countdown {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

@media (prefers-reduced-motion: reduce) {
  [style*='toast-countdown'] {
    animation-duration: 0s !important;
  }
}
</style>
