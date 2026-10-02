<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '~/composables/useAuth'

definePageMeta({
  layout: 'auth',
})

const { login, isLoading } = useAuth()

const email = ref('admin@arenastore.mm')
const password = ref('')
const totpCode = ref('')
const showPassword = ref(false)
const errorMessage = ref('')

async function handleLogin() {
  if (!email.value || !password.value) {
    errorMessage.value = 'Please provide both email/username and password.'
    return
  }

  errorMessage.value = ''
  const result = await login(email.value, password.value, totpCode.value.trim())
  if (!result.success) {
    errorMessage.value = result.error || 'Invalid credentials. Please try again.'
  }
}
</script>

<template>
  <div class="w-full max-w-md p-6 relative z-10">
    <div class="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl shadow-black/60 relative overflow-hidden">
      <!-- Top Accent Line -->
      <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500"></div>

      <!-- Header & Branding -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-slate-800/80 border border-slate-700/80 p-3 mb-4 shadow-xl shadow-cyan-500/10 relative group">
          <div class="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 via-purple-500 to-indigo-500 rounded-3xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
          <img
            src="/logo.png"
            alt="Arena Store Logo"
            class="w-full h-full object-contain relative z-10 drop-shadow-md"
          />
        </div>
        <h1 class="text-2xl font-bold text-white tracking-tight">ArenaStore</h1>
        <p class="text-xs uppercase tracking-widest font-semibold text-cyan-400 mt-1">Management Portal</p>
        <p class="text-xs text-slate-400 mt-2">Sign in with administrator credentials to manage catalog, orders, and wallet deposits.</p>
      </div>

      <!-- Error Alert -->
      <div
        v-if="errorMessage"
        class="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5 animate-shake"
      >
        <i class="pi pi-exclamation-triangle text-base text-rose-400 flex-shrink-0"></i>
        <span>{{ errorMessage }}</span>
      </div>

      <!-- Login Form -->
      <form @submit.prevent="handleLogin" class="space-y-5">
        <div>
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Email or Username</label>
          <div class="relative">
            <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <i class="pi pi-user text-sm"></i>
            </span>
            <input
              v-model="email"
              type="text"
              required
              autocomplete="username"
              placeholder="admin@arenastore.mm"
              class="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
            />
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Password</label>
            <span class="text-[11px] text-cyan-400/80 font-mono">Protected</span>
          </div>
          <div class="relative">
            <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <i class="pi pi-lock text-sm"></i>
            </span>
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              autocomplete="current-password"
              placeholder="••••••••••••"
              class="w-full pl-10 pr-10 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors font-mono"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
            >
              <i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" class="text-sm"></i>
            </button>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider">2FA Code</label>
            <span class="text-[11px] text-slate-500 font-mono">6 digits — if enabled</span>
          </div>
          <div class="relative">
            <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <i class="pi pi-shield text-sm"></i>
            </span>
            <input
              v-model="totpCode"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              placeholder="••••••"
              class="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors font-mono tracking-[0.4em]"
            />
          </div>
        </div>

        <button
          type="submit"
          :disabled="isLoading"
          class="w-full mt-2 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl text-sm transition-all duration-200 shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <i v-if="isLoading" class="pi pi-spin pi-spinner text-sm"></i>
          <span>{{ isLoading ? 'Authenticating...' : 'Sign In to Dashboard' }}</span>
          <i v-if="!isLoading" class="pi pi-arrow-right text-xs"></i>
        </button>
      </form>

      <!-- Footer Info -->
      <div class="mt-8 pt-6 border-t border-slate-800/80 text-center">
        <p class="text-[11px] text-slate-500 font-mono">
          ArenaStore v2.0
        </p>
      </div>
    </div>
  </div>
</template>
