<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { usePermission } from '~/composables/usePermission'

const { user, logout } = useAuth()
const { can } = usePermission()
</script>

<template>
  <div class="min-h-[60vh] flex items-center justify-center">
    <div class="max-w-md w-full p-8 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm text-center space-y-4">
      <div class="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
        <i class="pi pi-lock text-2xl"></i>
      </div>
      <h1 class="text-xl font-bold text-slate-900 dark:text-white">Access Denied</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Your role (<span class="font-semibold">{{ user?.role }}</span>) does not have permission to view this page.
        Ask a SUPERADMIN if you believe this is a mistake.
      </p>
      <div class="flex items-center justify-center gap-3 pt-2">
        <NuxtLink
          v-if="can('overview.view')"
          to="/"
          class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          Back to Overview
        </NuxtLink>
        <button
          type="button"
          @click="logout()"
          class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  </div>
</template>
