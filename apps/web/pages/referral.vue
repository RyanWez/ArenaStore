<script setup lang="ts">
import { Users, Gift, Sparkles, Copy, Check, ExternalLink, KeyRound } from "lucide-vue-next";
import { useStoreAuth } from "~/composables/useStoreAuth";
import { SITE_CONFIG } from "~/config/site";

const { user, isAuthenticated } = useStoreAuth();

const copied = ref(false);

const inviteLink = computed(() => {
  if (!user.value?.telegramId) return "";
  return `https://t.me/${SITE_CONFIG.botUsername}?start=ref_${user.value.telegramId}`;
});

const copyInviteLink = async () => {
  if (!inviteLink.value) return;
  try {
    await navigator.clipboard.writeText(inviteLink.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error("Failed to copy link:", err);
  }
};

useHead({
  title: "Affiliate & Referral — Arena Store",
  meta: [
    { name: "description", content: "Invite friends to Arena Store and earn lifetime 3% commissions on all digital purchases." },
  ],
});
</script>

<template>
  <div class="space-y-6 animate-fade-in max-w-4xl mx-auto">
    <!-- Page Header -->
    <div class="flex items-center justify-between border-b border-arena-border pb-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center space-x-2.5">
          <Gift class="h-6 w-6 text-arena-orange" />
          <span>သူငယ်ချင်း ဖိတ်ခေါ်ခြင်း (Affiliate 3%)</span>
        </h1>
        <p class="text-xs sm:text-sm text-arena-muted mt-1">
          သူငယ်ချင်းများကို ဖိတ်ခေါ်ပြီး တစ်သက်တာ ဝယ်ယူမှုတိုင်းမှ 3% ကော်မရှင် ရယူပါ
        </p>
      </div>
    </div>

    <!-- Referral Rules Banner -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="rounded-2xl border border-arena-border bg-arena-surface p-5 space-y-2">
        <div class="flex items-center space-x-2 text-arena-orange">
          <Sparkles class="h-4 w-4" />
          <h3 class="text-sm font-bold text-white">ကြိုဆိုလက်ဆောင် 200 ကျပ်</h3>
        </div>
        <p class="text-xs text-arena-muted leading-relaxed">
          သင့် Invite Link မှတစ်ဆင့် စတင်စာရင်းသွင်းသော သူငယ်ချင်းတိုင်း ကြိုဆိုလက်ဆောင် <strong>200 MMK</strong> ကို Wallet ထဲသို့ ချက်ချင်းရရှိပါမည်။
        </p>
      </div>

      <div class="rounded-2xl border border-arena-border bg-arena-surface p-5 space-y-2">
        <div class="flex items-center space-x-2 text-arena-emerald">
          <Users class="h-4 w-4" />
          <h3 class="text-sm font-bold text-white">တစ်သက်တာ 3% ကော်မရှင်</h3>
        </div>
        <p class="text-xs text-arena-muted leading-relaxed">
          သူငယ်ချင်းများ ပစ္စည်းဝယ်ယူ အောင်မြင်တိုင်း စုစုပေါင်းတန်ဖိုး၏ <strong>3%</strong> ကို သင့် Wallet ထဲသို့ အလိုအလျောက် ထည့်သွင်းပေးပါသည်။
        </p>
      </div>
    </div>

    <!-- Link Generation Area -->
    <div v-if="!isAuthenticated" class="rounded-2xl border border-arena-border bg-arena-surface p-8 text-center space-y-4">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-arena-elevated border border-arena-border text-arena-orange">
        <KeyRound class="h-6 w-6" />
      </div>
      <div class="space-y-1">
        <h3 class="text-base font-bold text-white">ဖိတ်ခေါ် Link ရယူရန် Login အရင်ဝင်ပါ</h3>
        <p class="text-xs text-arena-muted max-w-sm mx-auto">
          ကိုယ်ပိုင် Referral Link နှင့် ကော်မရှင်စာရင်းများကို ကြည့်ရှုရန် Telegram အကောင့်ဖြင့် ချိတ်ဆက်ပေးပါ။
        </p>
      </div>
      <div class="pt-2">
        <NuxtLink
          to="/"
          class="inline-flex items-center space-x-2 rounded-lg bg-arena-orange px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-arena-orange-hover"
        >
          <span>ပင်မစာမျက်နှာသို့ သွားမည်</span>
        </NuxtLink>
      </div>
    </div>

    <div v-else class="rounded-2xl border border-arena-border bg-arena-surface p-6 space-y-4">
      <h3 class="text-sm font-bold text-white">သင့်၏ သီးသန့် ဖိတ်ခေါ် Link (Your Invite Link)</h3>
      <div class="flex items-center space-x-2">
        <input
          type="text"
          readonly
          :value="inviteLink"
          class="w-full rounded-lg border border-arena-border bg-arena-elevated px-3 py-2 text-xs font-mono text-arena-text select-all focus:outline-none"
        />
        <button
          type="button"
          @click="copyInviteLink"
          class="flex items-center space-x-1.5 rounded-lg bg-arena-orange px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-arena-orange-hover shrink-0"
        >
          <component :is="copied ? Check : Copy" class="h-3.5 w-3.5" />
          <span>{{ copied ? "ကူးယူပြီး" : "Copy Link" }}</span>
        </button>
      </div>
      <p class="text-[11px] text-arena-subtle">
        ဤ Link ကို Telegram သို့မဟုတ် Social Media များတွင် သူငယ်ချင်းများထံ ပေးပို့ ဖိတ်ခေါ်နိုင်ပါသည်ခင်ဗျာ။
      </p>
    </div>
  </div>
</template>
