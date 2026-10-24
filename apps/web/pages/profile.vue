<script setup lang="ts">
import { computed } from "vue";
import {
  KeyRound,
  ShoppingBag,
  Crown,
  Users,
  ChevronRight,
  ShieldCheck,
} from "lucide-vue-next";
import MemberCard from "~/components/dashboard/MemberCard.vue";
import WalletBalanceCard from "~/components/dashboard/WalletBalanceCard.vue";
import ReferralWidget from "~/components/dashboard/ReferralWidget.vue";
import RecentOrdersCard from "~/components/dashboard/RecentOrdersCard.vue";
import { useStoreAuth } from "~/composables/useStoreAuth";

definePageMeta({
  layout: "dashboard",
});

const { user, isAuthenticated, openLoginModal } = useStoreAuth();

const displayName = computed(() => {
  if (!user.value) return "RYAN WEZ";
  const first = user.value.firstName || "";
  const last = user.value.lastName || "";
  return `${first} ${last}`.trim() || "ARENA MEMBER";
});

const handleTopup = () => {
  console.log("[Profile] Top-Up Action triggered");
};

useHead({
  title: "Dashboard & Profile — Arena Store",
  meta: [
    {
      name: "description",
      content: "Manage your digital accounts, prepaid MMK wallet, and lifetime affiliate rewards at Arena Store.",
    },
  ],
});
</script>

<template>
  <div class="space-y-6 sm:space-y-8 animate-fade-in">
    <!-- CASE A: AUTHENTICATED CUSTOMER DASHBOARD -->
    <template v-if="isAuthenticated && user">
      <!-- 1. WELCOME HEADER (Responsive: Mobile Stack vs Desktop Split) -->
      <div class="flex items-center justify-between pb-1">
        <!-- Left Title Info -->
        <div class="space-y-1">
          <!-- Mobile Welcome Label -->
          <div class="lg:hidden text-xs font-semibold text-arena-muted">
            Welcome back,
          </div>

          <!-- Main Name Title -->
          <h1 class="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight uppercase">
            {{ displayName }}
          </h1>

          <!-- Subtitle / Meta -->
          <div class="flex items-center space-x-2 text-xs text-arena-muted">
            <span class="inline-flex items-center space-x-1 text-arena-orange font-semibold">
              <span>Premium Member</span>
            </span>
            <span class="text-arena-subtle">•</span>
            <span>Since 2026</span>
          </div>
        </div>

        <!-- Right Side: Mobile Circular Avatar vs Desktop Quote -->
        <div class="shrink-0">
          <!-- Mobile Avatar (< 1024px) -->
          <div class="lg:hidden flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-arena-hover to-arena-surface border-2 border-arena-orange/50 text-xl font-black text-white shadow-lg shadow-arena-orange/10 uppercase">
            {{ user.firstName?.charAt(0) || "R" }}
          </div>

          <!-- Desktop Slogan (>= 1024px) -->
          <div class="hidden lg:block text-right">
            <div class="text-xs italic text-arena-muted tracking-wide">
              "Good Games. Better People."
            </div>
            <div class="text-[10px] text-arena-subtle uppercase tracking-widest mt-0.5">
              Arena Store Customer Portal
            </div>
          </div>
        </div>
      </div>

      <!-- 2. MOBILE VIEW (< 1024px) matching mobile_dashboard.png -->
      <div class="lg:hidden space-y-5">
        <!-- Virtual Titanium Member Card -->
        <MemberCard />

        <!-- Wallet Balance Card with MMQR Top Up CTA -->
        <WalletBalanceCard @open-topup="handleTopup" />

        <!-- 3-Pill Quick Stat Summary Row -->
        <div class="grid grid-cols-3 gap-2.5">
          <!-- Pill 1: Total Orders -->
          <NuxtLink
            to="/orders"
            class="flex items-center justify-between rounded-2xl border border-arena-border/80 bg-[#12141C] p-3 text-white transition-colors hover:border-arena-border"
          >
            <div class="flex items-center space-x-2 min-w-0">
              <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-arena-orange">
                <ShoppingBag class="h-3.5 w-3.5" />
              </div>
              <div class="truncate">
                <div class="font-mono font-bold text-xs sm:text-sm text-white">5</div>
                <div class="text-[9px] text-arena-muted truncate">Orders</div>
              </div>
            </div>
            <ChevronRight class="h-3 w-3 text-arena-subtle shrink-0" />
          </NuxtLink>

          <!-- Pill 2: Active Services -->
          <NuxtLink
            to="/orders"
            class="flex items-center justify-between rounded-2xl border border-arena-border/80 bg-[#12141C] p-3 text-white transition-colors hover:border-arena-border"
          >
            <div class="flex items-center space-x-2 min-w-0">
              <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-emerald-400">
                <Crown class="h-3.5 w-3.5" />
              </div>
              <div class="truncate">
                <div class="font-mono font-bold text-xs sm:text-sm text-white">1</div>
                <div class="text-[9px] text-arena-muted truncate">Active</div>
              </div>
            </div>
            <ChevronRight class="h-3 w-3 text-arena-subtle shrink-0" />
          </NuxtLink>

          <!-- Pill 3: Referrals -->
          <NuxtLink
            to="/referral"
            class="flex items-center justify-between rounded-2xl border border-arena-border/80 bg-[#12141C] p-3 text-white transition-colors hover:border-arena-border"
          >
            <div class="flex items-center space-x-2 min-w-0">
              <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sky-400">
                <Users class="h-3.5 w-3.5" />
              </div>
              <div class="truncate">
                <div class="font-mono font-bold text-xs sm:text-sm text-white">1</div>
                <div class="text-[9px] text-arena-muted truncate">Affiliate</div>
              </div>
            </div>
            <ChevronRight class="h-3 w-3 text-arena-subtle shrink-0" />
          </NuxtLink>
        </div>

        <!-- Recent Orders Module (Mobile list mode) -->
        <RecentOrdersCard />
      </div>

      <!-- 3. DESKTOP VIEW (>= 1024px) matching desktop_dashboard.png -->
      <div class="hidden lg:block space-y-8">
        <!-- Bento 3-Column Top Grid: Member Card + Wallet Balance + Refer & Earn -->
        <div class="grid grid-cols-12 gap-6 items-stretch">
          <!-- Col 1: Virtual Member Card (4 cols) -->
          <div class="col-span-4 flex">
            <MemberCard class="h-full" />
          </div>

          <!-- Col 2: Wallet Balance & Quick Top-Up (4 cols) -->
          <div class="col-span-4 flex">
            <WalletBalanceCard class="h-full" @open-topup="handleTopup" />
          </div>

          <!-- Col 3: Refer & Earn Widget (4 cols) -->
          <div class="col-span-4 flex">
            <ReferralWidget class="h-full" />
          </div>
        </div>

        <!-- Bottom Full-Width Recent Orders Table -->
        <RecentOrdersCard />
      </div>
    </template>

    <!-- CASE B: UNAUTHENTICATED GUEST NOTICE -->
    <template v-else>
      <div class="rounded-3xl border border-arena-border bg-gradient-to-b from-[#141720] via-[#0E1016] to-[#0A0C10] p-8 sm:p-12 text-center space-y-5 max-w-lg mx-auto shadow-2xl my-8">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-arena-orange/10 border border-arena-orange/20 text-arena-orange shadow-lg shadow-arena-orange/10">
          <KeyRound class="h-8 w-8" />
        </div>

        <div class="space-y-2">
          <div class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold">
            <ShieldCheck class="h-3.5 w-3.5" />
            <span>Telegram Secure Portal</span>
          </div>

          <h2 class="text-xl sm:text-2xl font-black text-white tracking-tight">
            Customer Dashboard သို့ ဝင်ရောက်ရန်
          </h2>

          <p class="text-xs sm:text-sm text-arena-muted leading-relaxed">
            မိမိ၏ Virtual Member Card၊ MMK Wallet လက်ကျန်ငွေနှင့် မှာယူထားသော အော်ဒါများကို ကြည့်ရှုရန် Telegram အကောင့်ဖြင့် စက္ကန့်ပိုင်းအတွင်း Login ဝင်ရောက်ပေးပါခင်ဗျာ။
          </p>
        </div>

        <div class="pt-3">
          <button
            type="button"
            @click="openLoginModal()"
            class="w-full flex items-center justify-center space-x-2 rounded-2xl bg-arena-orange px-6 py-3.5 text-sm font-extrabold text-white transition-all hover:bg-arena-orange-hover active:scale-[0.98] shadow-lg shadow-arena-orange/25"
          >
            <!-- Telegram Vector Icon -->
            <svg class="h-4 w-4 fill-current text-white shrink-0" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
            </svg>
            <span>Log in with Telegram</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
