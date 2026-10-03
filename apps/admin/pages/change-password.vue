<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useToast } from '~/composables/useToast'

definePageMeta({
  layout: 'auth',
})

const { getAuthHeaders, logout } = useAuth()
const { showToast } = useToast()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const isSaving = ref(false)
const errorMessage = ref('')

const passwordMismatch = computed(() => {
  return confirmPassword.value.length > 0 && newPassword.value !== confirmPassword.value
})

async function handleChangePassword() {
  errorMessage.value = ''

  if (!currentPassword.value || !newPassword.value) {
    errorMessage.value = 'Please fill in both your current (temporary) password and a new password.'
    return
  }
  if (newPassword.value.length < 8) {
    errorMessage.value = 'New password must be at least 8 characters long.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'New password and confirmation do not match.'
    return
  }

  isSaving.value = true
  try {
    const res: any = await $fetch('/api/admin/auth/change-password', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      },
    })

    if (res.ok) {
      showToast({
        title: 'Password updated',
        message: 'Please sign in with your new password.',
        type: 'success',
      })
      // The API revokes all sessions after a password change.
      await logout()
    } else {
      errorMessage.value = res.error || 'Failed to update password.'
    }
  } catch (err: any) {
    errorMessage.value = err?.data?.error || 'Failed to update password.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-md p-6 relative z-10">
    <div class="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl shadow-black/60 relative overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500"></div>

      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-4">
          <i class="pi pi-shield text-2xl"></i>
        </div>
        <h1 class="text-2xl font-bold text-white tracking-tight">Set Your Password</h1>
        <p class="text-xs text-slate-400 mt-2">
          Your account was created with a temporary password. Choose a new password to continue.
        </p>
      </div>

      <div
        v-if="errorMessage"
        class="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5"
      >
        <i class="pi pi-exclamation-triangle text-base text-rose-400 flex-shrink-0"></i>
        <span>{{ errorMessage }}</span>
      </div>

      <form @submit.prevent="handleChangePassword" class="space-y-5">
        <div>
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Temporary Password</label>
          <input
            v-model="currentPassword"
            type="password"
            required
            autocomplete="current-password"
            placeholder="••••••••••••"
            class="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors font-mono"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">New Password</label>
          <input
            v-model="newPassword"
            type="password"
            required
            minlength="8"
            autocomplete="new-password"
            placeholder="At least 8 characters"
            class="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors font-mono"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Confirm New Password</label>
          <input
            v-model="confirmPassword"
            type="password"
            required
            autocomplete="new-password"
            placeholder="Repeat new password"
            :class="passwordMismatch ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' : ''"
            class="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 transition-colors font-mono"
          />
          <p v-if="passwordMismatch" class="text-[11px] text-rose-400 mt-1.5">Passwords do not match.</p>
        </div>

        <button
          type="submit"
          :disabled="isSaving || passwordMismatch"
          class="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold rounded-xl text-sm transition-all duration-200 shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <i v-if="isSaving" class="pi pi-spin pi-spinner text-sm"></i>
          <span>{{ isSaving ? 'Updating...' : 'Update Password & Sign In' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>
