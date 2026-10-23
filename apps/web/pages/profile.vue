<script setup lang="ts">
import { User, ShieldCheck, Wallet, Sparkles, CreditCard, LogOut, KeyRound } from "lucide-vue-next";
import { useStoreAuth } from "~/composables/useStoreAuth";

const { user, balanceMmk, isAuthenticated, formatMmk, logout } = useStoreAuth();

useHead({
  title: "Account & Profile — Arena Store",
  meta: [
    { name: "description", content: "Customer profile, prepaid MMK wallet balance, and Arena Store VIP credentials." },
  ],
});
</script>

<template>
  <div class="space-y-6 animate-fade-in max-w-4xl mx-auto">
    <!-- Page Header -->
    <div class="flex items-center justify-between border-b border-arena-border pb-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center space-x-2.5">
          <User class="h-6 w-6 text-arena-orange" />
          <span>အကောင့်နှင့် ပရိုဖိုင် (Profile)</span>
        </h1>
        <p class="text-xs sm:text-sm text-arena-muted mt-1">
          အသုံးပြုသူ အချက်အလက်များနှင့် Prepaid Wallet စီမံခန့်ခွဲမှု
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
          ပရိုဖိုင်နှင့် လက်ကျန်ငွေ အသေးစိတ်ကို ကြည့်ရှုရန် Telegram အကောင့်ဖြင့် Login ဝင်ရောက်ပေးပါ။
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

    <div v-else class="space-y-6">
      <!-- Virtual Titanium Card Preview (Phase 4 Spec) -->
      <div class="relative overflow-hidden rounded-2xl border border-arena-border bg-gradient-to-br from-arena-surface to-arena-elevated p-6 text-white shadow-2xl">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="text-sm font-extrabold tracking-wider text-white">ARENA</span>
            <span class="rounded bg-arena-orange px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">MEMBER</span>
          </div>
          <div class="flex items-center space-x-1.5 rounded-full border border-arena-emerald/30 bg-arena-emerald/10 px-2 py-0.5 text-[10px] font-bold text-arena-emerald">
            <ShieldCheck class="h-3 w-3" />
            <span>TG VERIFIED</span>
          </div>
        </div>

        <div class="my-6 flex items-center justify-between">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-arena-muted">Wallet Balance</div>
            <div class="font-mono text-2xl sm:text-3xl font-extrabold text-arena-orange">
              {{ formatMmk(balanceMmk) }}
            </div>
          </div>
          <!-- EMV Chip Aesthetic -->
          <div class="h-8 w-11 rounded-md border border-amber-500/40 bg-amber-500/20 flex items-center justify-center">
            <div class="h-5 w-7 rounded border border-amber-500/30 grid grid-cols-2 gap-0.5 p-0.5">
              <div class="border-r border-amber-500/30" />
              <div />
            </div>
          </div>
        </div>

        <div class="flex items-end justify-between border-t border-arena-border pt-4 text-xs">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-arena-muted">Cardholder</div>
            <div class="font-medium text-white">{{ user?.firstName }} {{ user?.lastName || "" }}</div>
          </div>
          <div class="text-right">
            <div class="text-[10px] uppercase tracking-wider text-arena-muted">Telegram ID</div>
            <div class="font-mono text-arena-text">{{ user?.telegramId }}</div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-end pt-2">
        <button
          type="button"
          @click="logout"
          class="inline-flex items-center space-x-1.5 rounded-lg border border-arena-border bg-arena-surface px-3 py-1.5 text-xs font-medium text-arena-rose transition-colors hover:bg-arena-elevated"
        >
          <LogOut class="h-3.5 w-3.5" />
          <span>အကောင့်မှ ထွက်မည် (Logout)</span>
        </button>
      </div>
    </div>
  </div>
</template>
