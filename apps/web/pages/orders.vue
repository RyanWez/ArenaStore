<script setup lang="ts">
import { Package, ShieldAlert, KeyRound, ExternalLink, Clock } from "lucide-vue-next";
import { useStoreAuth } from "~/composables/useStoreAuth";

const { user, isAuthenticated } = useStoreAuth();

useHead({
  title: "My Orders — Arena Store",
  meta: [
    { name: "description", content: "View and manage your digital account orders, subscriptions, and instant license keys." },
  ],
});
</script>

<template>
  <div class="space-y-6 animate-fade-in max-w-4xl mx-auto">
    <!-- Page Header -->
    <div class="flex items-center justify-between border-b border-arena-border pb-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center space-x-2.5">
          <Package class="h-6 w-6 text-arena-orange" />
          <span>အော်ဒါများ (My Orders)</span>
        </h1>
        <p class="text-xs sm:text-sm text-arena-muted mt-1">
          ဝယ်ယူထားသော Digital Accounts များနှင့် License Keys များ
        </p>
      </div>
    </div>

    <!-- Authenticated State vs Guest State -->
    <div v-if="!isAuthenticated" class="rounded-2xl border border-arena-border bg-arena-surface p-8 text-center space-y-4">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-arena-elevated border border-arena-border text-arena-orange">
        <KeyRound class="h-6 w-6" />
      </div>
      <div class="space-y-1">
        <h3 class="text-base font-bold text-white">Login ဝင်ရောက်ထားခြင်း မရှိသေးပါ</h3>
        <p class="text-xs text-arena-muted max-w-sm mx-auto">
          ယခင် ဝယ်ယူထားသော အော်ဒါများနှင့် အကောင့် အချက်အလက်များကို ကြည့်ရှုရန် Telegram အကောင့်ဖြင့် Login ဝင်ရောက်ပေးပါ။
        </p>
      </div>
      <div class="pt-2">
        <NuxtLink
          to="/"
          class="inline-flex items-center space-x-2 rounded-lg bg-arena-orange px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-arena-orange-hover"
        >
          <span>ပင်မစာမျက်နှာသို့ ပြန်သွားမည်</span>
        </NuxtLink>
      </div>
    </div>

    <div v-else class="space-y-4">
      <!-- Empty Orders State (Ready for Phase 4 Vault binding) -->
      <div class="rounded-2xl border border-dashed border-arena-border bg-arena-surface/60 p-10 text-center space-y-3">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-arena-elevated border border-arena-border text-arena-muted">
          <Clock class="h-6 w-6" />
        </div>
        <div class="space-y-1">
          <h3 class="text-sm font-bold text-white">မကြာသေးမီက အော်ဒါမှတ်တမ်း မရှိသေးပါ</h3>
          <p class="text-xs text-arena-muted max-w-sm mx-auto">
            ကုန်ပစ္စည်းများကို ပင်မစာမျက်နှာမှတစ်ဆင့် ရွေးချယ်ဝယ်ယူနိုင်ပါသည်ခင်ဗျာ။
          </p>
        </div>
        <div class="pt-3">
          <NuxtLink
            to="/#catalog"
            class="inline-flex items-center space-x-1.5 rounded-lg border border-arena-border bg-arena-elevated px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:border-arena-border-strong"
          >
            <span>ကုန်ပစ္စည်းများ ကြည့်ရှုရန်</span>
            <ExternalLink class="h-3 w-3 text-arena-orange" />
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
