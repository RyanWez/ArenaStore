<script setup lang="ts">
import { computed, ref } from "vue";
import { Users, Copy, Check, Send, Sparkles, Info } from "lucide-vue-next";
import { useStoreAuth } from "~/composables/useStoreAuth";
import { SITE_CONFIG } from "~/config/site";

const { user } = useStoreAuth();
const isCopied = ref(false);

const botUsername = SITE_CONFIG.botUsername || "arenastoredev_bot";

// Personalized referral link
const referralLink = computed(() => {
  const tid = user.value?.telegramId || "ryanwez";
  return `https://t.me/${botUsername}?start=ref_${tid}`;
});

// Copy link to clipboard
const copyReferralLink = async () => {
  try {
    await navigator.clipboard.writeText(referralLink.value);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  } catch (err) {
    console.warn("Failed to copy referral link:", err);
  }
};

// Share via Telegram
const shareOnTelegram = () => {
  const text = encodeURIComponent(
    "🛍️ Arena Store — Premium Digital Products & Memberships စက္ကန့်ပိုင်းအတွင်း အလွယ်တကူ ဝယ်ယူလိုက်ပါ။ ကြိုဆိုလက်ဆောင် 200 ကျပ် ရယူရန် အောက်ပါ Link မှ စတင်ပါခင်ဗျာ!"
  );
  const url = encodeURIComponent(referralLink.value);
  window.open(`https://t.me/share/url?url=${url}&text=${text}`, "_blank");
};
</script>

<template>
  <div class="relative w-full flex flex-col justify-between overflow-hidden rounded-[26px] border border-arena-border/80 bg-gradient-to-b from-[#141720] via-[#0E1016] to-[#0A0C10] p-6 shadow-xl text-white select-none transition-all duration-300 hover:border-arena-border">
    <!-- Top Row: Icon + Title -->
    <div class="relative z-10 space-y-1">
      <div class="flex items-center space-x-2.5">
        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
          <Users class="h-4 w-4" />
        </div>
        <span class="text-sm font-bold text-white tracking-wide">Refer & Earn</span>
      </div>
      <p class="text-xs text-arena-muted">
        Share Arena Store with your friends & earn lifetime commission
      </p>
    </div>

    <!-- Middle: Two Big Stat Badges -->
    <div class="relative z-10 my-4 grid grid-cols-2 gap-3">
      <!-- Stat 1: Total Referrals -->
      <div class="rounded-2xl border border-arena-border/60 bg-[#12141C]/80 p-3.5 space-y-1">
        <div class="font-mono text-2xl sm:text-3xl font-black text-white">
          {{ user?.telegramId ? "1" : "0" }}
        </div>
        <div class="text-[11px] font-medium text-arena-muted">
          Active Referrals
        </div>
      </div>

      <!-- Stat 2: Total Commission Earned -->
      <div class="rounded-2xl border border-arena-border/60 bg-[#12141C]/80 p-3.5 space-y-1">
        <div class="font-mono text-xl sm:text-2xl font-black text-emerald-400 truncate">
          +0 <span class="text-xs font-normal text-arena-muted">MMK</span>
        </div>
        <div class="text-[11px] font-medium text-arena-muted">
          3% Commission
        </div>
      </div>
    </div>

    <!-- Referral Link Copy Pill -->
    <div class="relative z-10 space-y-3">
      <div class="relative flex items-center rounded-2xl border border-arena-border/80 bg-[#0A0C10] p-1.5 focus-within:border-arena-border-strong transition-colors">
        <input
          :value="referralLink"
          readonly
          class="w-full bg-transparent px-3 text-xs font-mono text-arena-muted truncate focus:outline-none select-all"
        />
        <button
          type="button"
          @click="copyReferralLink"
          class="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-arena-muted hover:text-white transition-colors shrink-0"
          :title="isCopied ? 'Copied' : 'Copy Link'"
        >
          <component :is="isCopied ? Check : Copy" class="h-4 w-4" :class="isCopied ? 'text-emerald-400' : ''" />
        </button>
      </div>

      <!-- Share on Telegram Button -->
      <button
        type="button"
        @click="shareOnTelegram"
        class="w-full flex items-center justify-center space-x-2 rounded-2xl border border-arena-border/80 bg-arena-surface hover:bg-arena-elevated px-4 py-3 text-xs font-bold text-white transition-all active:scale-[0.98] group"
      >
        <Send class="h-3.5 w-3.5 text-sky-400 transition-transform group-hover:translate-x-0.5" />
        <span>Share on Telegram</span>
      </button>

      <!-- Footnote Rules -->
      <div class="flex items-center space-x-1.5 text-[10px] text-arena-subtle pt-0.5">
        <Info class="h-3 w-3 shrink-0" />
        <span>Your friends get 200 MMK. You get 3% lifetime commission.</span>
      </div>
    </div>
  </div>
</template>
