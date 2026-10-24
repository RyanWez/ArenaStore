<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import {
  X,
  ShieldCheck,
  Send,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  Zap,
  Lock,
  Wallet,
  Sparkles,
} from "lucide-vue-next";
import { useStoreAuth } from "~/composables/useStoreAuth";
import { SITE_CONFIG } from "~/config/site";

const {
  isAuthModalOpen,
  authStep,
  currentTicket,
  countdownSeconds,
  authContextMessage,
  authError,
  user,
  balanceMmk,
  formatMmk,
  closeLoginModal,
  startTicketChallenge,
  backToIntro,
} = useStoreAuth();

const isCopied = ref(false);

// Format countdown mm:ss
const formattedCountdown = computed(() => {
  const m = Math.floor(countdownSeconds.value / 60);
  const s = countdownSeconds.value % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
});

// Telegram deep-link URL
const botDeepLink = computed(() => {
  if (!currentTicket.value?.ticketId) return "#";
  const botUser = SITE_CONFIG.botUsername || "arenastoredev_bot";
  return `https://t.me/${botUser}?start=login_${currentTicket.value.ticketId}`;
});

// Copy 4-digit code to clipboard
const copyCode = async () => {
  if (!currentTicket.value?.code) return;
  try {
    await navigator.clipboard.writeText(currentTicket.value.code);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  } catch (err) {
    console.warn("Failed to copy code:", err);
  }
};

// Keyboard escape listener to close modal
const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape" && isAuthModalOpen.value && authStep.value !== "confirmed") {
    closeLoginModal();
  }
};

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isAuthModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      >
        <!-- Dark Backdrop with blur (Persistent: clicks do not dismiss) -->
        <div
          class="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300"
        />

        <!-- Modal Dialog Box -->
        <Transition
          enter-active-class="transition duration-300 cubic-bezier(0.16, 1, 0.3, 1)"
          enter-from-class="opacity-0 scale-95 translate-y-3"
          enter-to-class="opacity-100 scale-100 translate-y-0"
          leave-active-class="transition duration-200 ease-in"
          leave-from-class="opacity-100 scale-100 translate-y-0"
          leave-to-class="opacity-0 scale-95 translate-y-2"
        >
          <div
            class="relative w-full max-w-md sm:max-w-lg rounded-3xl border border-arena-border/80 bg-gradient-to-b from-[#181A24] via-[#0E1016] to-[#0A0C10] p-6 sm:p-7 text-center shadow-[0_25px_60px_rgba(0,0,0,0.95)] overflow-hidden transition-all duration-300"
            @click.stop
          >
            <!-- Ambient Top Lighting -->
            <div
              class="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-80 rounded-full bg-arena-orange/15 blur-3xl transition-opacity duration-500"
            />

            <!-- Top Row: Stepper Progress + Close 'X' Button -->
            <div class="relative z-10 flex items-center justify-between pb-3.5 border-b border-arena-border/50">
              <!-- Stepper Indicator -->
              <div class="flex items-center space-x-2 text-xs font-semibold">
                <button
                  type="button"
                  @click="authStep !== 'confirmed' && backToIntro()"
                  class="flex items-center space-x-1.5 px-2.5 py-1 rounded-full transition-all duration-300"
                  :class="authStep === 'intro' ? 'bg-arena-orange/15 text-arena-orange border border-arena-orange/30 font-bold' : 'text-arena-muted bg-white/5 hover:text-white'"
                >
                  <span
                    class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold transition-colors"
                    :class="authStep === 'intro' ? 'bg-arena-orange text-white' : 'bg-white/10 text-arena-muted'"
                  >1</span>
                  <span>အချက်အလက်</span>
                </button>

                <span class="text-arena-subtle">•</span>

                <div
                  class="flex items-center space-x-1.5 px-2.5 py-1 rounded-full transition-all duration-300"
                  :class="authStep !== 'intro' && authStep !== 'confirmed' ? 'bg-arena-orange/15 text-arena-orange border border-arena-orange/30 font-bold' : 'text-arena-muted bg-white/5'"
                >
                  <span
                    class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold transition-colors"
                    :class="authStep !== 'intro' && authStep !== 'confirmed' ? 'bg-arena-orange text-white' : 'bg-white/10 text-arena-muted'"
                  >2</span>
                  <span>ကုဒ် ၄ လုံး</span>
                </div>
              </div>

              <!-- Close 'X' Button -->
              <button
                type="button"
                @click="closeLoginModal"
                class="flex h-8 w-8 items-center justify-center rounded-full text-arena-muted hover:text-white hover:bg-white/10 transition-colors"
                title="ပိတ်မည်"
              >
                <X class="h-4 w-4" />
              </button>
            </div>

            <!-- STEP TRANSITIONS WRAPPER (Gentle and silky) -->
            <Transition name="step-fade" mode="out-in">
              <!-- STEP 1: ONBOARDING / EXPLANATION -->
              <div
                v-if="authStep === 'intro'"
                key="step-intro"
                class="relative z-10 py-4 space-y-4 text-left"
              >
                <!-- Title & Context Headline -->
                <div class="space-y-1.5">
                  <div class="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-semibold">
                    <ShieldCheck class="h-3 w-3" />
                    <span>Telegram Instant Security</span>
                  </div>

                  <h3 class="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
                    {{ authContextMessage ? "ဝယ်ယူမှု ဆက်လက်ပြုလုပ်ရန် ချိတ်ဆက်ပါ" : "Telegram ဖြင့် စက္ကန့်ပိုင်းအတွင်း စတင်ပါ" }}
                  </h3>

                  <p class="text-xs text-arena-muted leading-relaxed">
                    Arena Store တွင် Password ရိုက်စရာမလိုဘဲ မိမိ Telegram အကောင့်ဖြင့် လုံခြုံစိတ်ချစွာ 1-Click ချိတ်ဆက်၍ ဈေးဝယ်ယူနိုင်ပါသည်ခင်ဗျာ။
                  </p>
                </div>

                <!-- Context Purchase Callout (if triggered via a product card) -->
                <div
                  v-if="authContextMessage"
                  class="rounded-2xl bg-arena-orange/10 border border-arena-orange/25 p-3.5 space-y-1 transition-all"
                >
                  <div class="flex items-center space-x-1.5 text-arena-orange text-xs font-bold">
                    <Sparkles class="h-3.5 w-3.5 shrink-0" />
                    <span>ဝယ်ယူလိုသော ပစ္စည်း</span>
                  </div>
                  <p class="text-xs text-arena-text leading-relaxed font-medium">
                    {{ authContextMessage }}
                  </p>
                </div>

                <!-- 3 Feature Highlights (Why Telegram login is needed) -->
                <div class="space-y-2 pt-1">
                  <!-- Feature 1 -->
                  <div class="flex items-start space-x-3 rounded-2xl border border-arena-border/70 bg-[#12141C]/80 p-3 transition-colors hover:border-arena-border">
                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-arena-orange/10 border border-arena-orange/20 text-arena-orange mt-0.5">
                      <Zap class="h-4 w-4" />
                    </div>
                    <div class="space-y-0.5">
                      <h4 class="text-xs font-bold text-white">ချက်ချင်း အလိုအလျောက် ပေးပို့ခြင်း</h4>
                      <p class="text-[11px] text-arena-muted leading-relaxed">
                        ဝယ်ယူပြီးသည်နှင့် မိမိအကောင့် / လိုင်စင်ကုဒ်များကို Telegram Bot ထဲသို့ ချက်ချင်း တိုက်ရိုက် ပေးပို့ပေးပါသည်။
                      </p>
                    </div>
                  </div>

                  <!-- Feature 2 -->
                  <div class="flex items-start space-x-3 rounded-2xl border border-arena-border/70 bg-[#12141C]/80 p-3 transition-colors hover:border-arena-border">
                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mt-0.5">
                      <Lock class="h-4 w-4" />
                    </div>
                    <div class="space-y-0.5">
                      <h4 class="text-xs font-bold text-white">စကားဝှက် မလိုသော လုံခြုံရေး</h4>
                      <p class="text-[11px] text-arena-muted leading-relaxed">
                        Password မှတ်စရာ မလိုဘဲ Telegram Bot တွင် ကုဒ်နံပါတ် ၄ လုံး ရွေးချယ်ရုံဖြင့် လုံခြုံစွာ အတည်ပြုနိုင်ပါသည်။
                      </p>
                    </div>
                  </div>

                  <!-- Feature 3 -->
                  <div class="flex items-start space-x-3 rounded-2xl border border-arena-border/70 bg-[#12141C]/80 p-3 transition-colors hover:border-arena-border">
                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 mt-0.5">
                      <Wallet class="h-4 w-4" />
                    </div>
                    <div class="space-y-0.5">
                      <h4 class="text-xs font-bold text-white">Wallet နှင့် အာမခံ သက်တမ်း စောင့်ကြည့်မှု</h4>
                      <p class="text-[11px] text-arena-muted leading-relaxed">
                        လက်ကျန်ငွေ စစ်ဆေးခြင်း၊ မှာယူမှု မှတ်တမ်းများနှင့် အာမခံ သက်တမ်းကို အချိန်မရွေး လွယ်ကူစွာ စစ်ဆေးနိုင်ပါသည်။
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Primary CTA: Proceed to Next Step (Code Challenge) -->
                <div class="pt-2">
                  <button
                    type="button"
                    @click="startTicketChallenge"
                    class="w-full flex items-center justify-center space-x-2 rounded-2xl bg-arena-orange px-6 py-3.5 text-sm font-extrabold text-white transition-all duration-300 hover:bg-arena-orange-hover active:scale-[0.98] shadow-lg shadow-arena-orange/25 group"
                  >
                    <span>နောက်တစ်ဆင့်သို့ (Next Step)</span>
                    <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
              </div>

              <!-- STEP 2A: GENERATING TICKET -->
              <div
                v-else-if="authStep === 'generating'"
                key="step-generating"
                class="relative z-10 py-10 space-y-6 text-center"
              >
                <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#141722] border border-arena-border">
                  <RefreshCw class="h-6 w-6 text-arena-orange animate-spin" />
                </div>
                <div class="space-y-2">
                  <h3 class="text-lg font-bold text-white">လုံခြုံရေးကုဒ် ထုတ်ယူနေပါသည်...</h3>
                  <p class="text-xs text-arena-muted">ကျေးဇူးပြု၍ ခေတ္တ စောင့်ဆိုင်းပေးပါခင်ဗျာ</p>
                </div>
                <!-- 4 Digit Shimmer Placeholders -->
                <div class="flex items-center justify-center space-x-3">
                  <div v-for="i in 4" :key="i" class="h-16 w-12 sm:h-20 sm:w-14 rounded-2xl bg-arena-elevated/80 border border-arena-border/60 animate-pulse" />
                </div>
              </div>

              <!-- STEP 2B: AWAITING TELEGRAM HANDSHAKE -->
              <div
                v-else-if="authStep === 'awaiting' && currentTicket"
                key="step-awaiting"
                class="relative z-10 py-5 space-y-5 text-center"
              >
                <!-- Headline & Guidance -->
                <div class="space-y-1.5">
                  <h3 class="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Telegram Bot တွင် အတည်ပြုပါ
                  </h3>
                  <p class="text-xs text-arena-muted max-w-sm mx-auto leading-relaxed">
                    စကားဝှက် ရိုက်ထည့်စရာမလိုဘဲ အောက်ပါ <span class="text-white font-bold">ဂဏန်း ၄ လုံး</span> ကို Telegram Bot တွင် ရွေးချယ်ပေးပါခင်ဗျာ။
                  </p>
                </div>

                <!-- 4 Monolithic Digit Boxes -->
                <div class="flex items-center justify-center space-x-2.5 sm:space-x-3.5 select-all">
                  <div
                    v-for="(digit, idx) in currentTicket.code.split('')"
                    :key="idx"
                    class="h-16 w-12 sm:h-20 sm:w-16 rounded-2xl border-2 border-arena-orange/60 bg-[#12141C] text-3xl sm:text-4xl font-mono font-black text-white flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.6),0_0_20px_rgba(255,90,31,0.25)] transition-transform duration-300 hover:scale-105"
                  >
                    {{ digit }}
                  </div>
                </div>

                <!-- Live Handshake Radar Dot + Countdown -->
                <div class="flex items-center justify-between px-2 pt-0.5 text-xs">
                  <div class="flex items-center space-x-2 text-emerald-400 font-medium">
                    <span class="relative flex h-2.5 w-2.5">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                    </span>
                    <span>Live Handshake</span>
                  </div>

                  <div
                    class="font-mono font-bold tracking-wider px-2.5 py-0.5 rounded-full border text-[11px] transition-colors"
                    :class="countdownSeconds < 60 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-white/5 border-white/10 text-arena-muted'"
                  >
                    ⏳ {{ formattedCountdown }}
                  </div>
                </div>

                <!-- Primary CTA: Direct Telegram Bot Deep Link -->
                <div class="pt-1 space-y-3">
                  <a
                    :href="botDeepLink"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="w-full flex items-center justify-center space-x-2 rounded-2xl bg-arena-orange px-6 py-3.5 text-sm font-extrabold text-white transition-all duration-300 hover:bg-arena-orange-hover active:scale-[0.98] shadow-lg shadow-arena-orange/25 group"
                  >
                    <Send class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    <span>Telegram Bot တွင် ဖွင့်မည်</span>
                    <ExternalLink class="h-3.5 w-3.5 opacity-60 ml-0.5" />
                  </a>

                  <!-- Quick Helpers: Back, Copy Code & Refresh -->
                  <div class="flex flex-wrap items-center justify-center gap-3 pt-1 text-xs">
                    <button
                      type="button"
                      @click="backToIntro"
                      class="inline-flex items-center space-x-1.5 text-arena-muted hover:text-white transition-colors duration-200"
                    >
                      <ArrowLeft class="h-3.5 w-3.5" />
                      <span>ရှေ့သို့ ပြန်သွားမည်</span>
                    </button>

                    <span class="text-arena-border">•</span>

                    <button
                      type="button"
                      @click="copyCode"
                      class="inline-flex items-center space-x-1.5 text-arena-muted hover:text-white transition-colors duration-200"
                    >
                      <component :is="isCopied ? Check : Copy" class="h-3.5 w-3.5" :class="isCopied ? 'text-emerald-400' : ''" />
                      <span>{{ isCopied ? "ကူးယူပြီးပါပြီ" : "ကုဒ်ကူးယူမည်" }}</span>
                    </button>

                    <span class="text-arena-border">•</span>

                    <button
                      type="button"
                      @click="startTicketChallenge"
                      class="inline-flex items-center space-x-1.5 text-arena-muted hover:text-white transition-colors duration-200"
                    >
                      <RefreshCw class="h-3.5 w-3.5" />
                      <span>ကုဒ်အသစ် တောင်းမည်</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- STATE 3: CONFIRMED (SUCCESS) -->
              <div
                v-else-if="authStep === 'confirmed'"
                key="step-confirmed"
                class="relative z-10 py-10 space-y-5 text-center"
              >
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.3)]">
                  <CheckCircle2 class="h-8 w-8" />
                </div>

                <div class="space-y-1.5">
                  <h3 class="text-2xl font-black text-white tracking-tight">
                    Login အောင်မြင်ပါသည်!
                  </h3>
                  <p class="text-sm font-medium text-emerald-400">
                    မင်္ဂလာပါ {{ user?.firstName || "Customer" }} ခင်ဗျာ
                  </p>
                  <p class="text-xs text-arena-muted pt-1">
                    လက်ကျန်ငွေ: <span class="font-mono font-bold text-white">{{ formatMmk(balanceMmk) }}</span>
                  </p>
                </div>
              </div>

              <!-- STATE 4: EXPIRED OR CANCELLED -->
              <div
                v-else-if="authStep === 'expired' || authStep === 'cancelled'"
                key="step-expired"
                class="relative z-10 py-8 space-y-5 text-center"
              >
                <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <AlertTriangle class="h-7 w-7" />
                </div>

                <div class="space-y-1">
                  <h3 class="text-lg font-bold text-white">
                    {{ authStep === "cancelled" ? "Login ပယ်ဖျက်လိုက်ပါသည်" : "လုံခြုံရေးကုဒ် သက်တမ်း ကုန်ဆုံးသွားပါပြီ" }}
                  </h3>
                  <p class="text-xs text-arena-muted max-w-xs mx-auto leading-relaxed">
                    လုံခြုံရေးအရ Website Login Request တစ်ခုသည် ၅ မိနစ်သာ သက်တမ်းရှိပါသည်။
                  </p>
                </div>

                <div class="flex items-center justify-center space-x-3 pt-1">
                  <button
                    type="button"
                    @click="backToIntro"
                    class="inline-flex items-center space-x-1.5 rounded-xl border border-arena-border bg-arena-surface px-4 py-2.5 text-xs font-semibold text-white transition-all hover:border-arena-border-strong hover:bg-arena-elevated"
                  >
                    <ArrowLeft class="h-3.5 w-3.5" />
                    <span>အစသို့ ပြန်သွားမည်</span>
                  </button>

                  <button
                    type="button"
                    @click="startTicketChallenge"
                    class="inline-flex items-center space-x-2 rounded-xl bg-arena-orange px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-arena-orange-hover active:scale-95 shadow-md shadow-arena-orange/20"
                  >
                    <RefreshCw class="h-3.5 w-3.5" />
                    <span>ကုဒ်အသစ် တောင်းမည်</span>
                  </button>
                </div>
              </div>

              <!-- STATE 5: ERROR -->
              <div
                v-else-if="authStep === 'error'"
                key="step-error"
                class="relative z-10 py-8 space-y-5 text-center"
              >
                <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400">
                  <AlertTriangle class="h-7 w-7" />
                </div>

                <div class="space-y-1">
                  <h3 class="text-lg font-bold text-white">ချိတ်ဆက်မှု အဆင်မပြေပါ</h3>
                  <p class="text-xs text-red-400 max-w-xs mx-auto leading-relaxed">
                    {{ authError || "အမှားအယွင်း ဖြစ်ပေါ်ခဲ့ပါသည်။" }}
                  </p>
                </div>

                <div class="flex items-center justify-center space-x-3 pt-1">
                  <button
                    type="button"
                    @click="backToIntro"
                    class="inline-flex items-center space-x-1.5 rounded-xl border border-arena-border bg-arena-surface px-4 py-2.5 text-xs font-semibold text-white transition-all hover:border-arena-border-strong hover:bg-arena-elevated"
                  >
                    <ArrowLeft class="h-3.5 w-3.5" />
                    <span>အစသို့ ပြန်သွားမည်</span>
                  </button>

                  <button
                    type="button"
                    @click="startTicketChallenge"
                    class="inline-flex items-center space-x-2 rounded-xl bg-arena-orange px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-arena-orange-hover active:scale-95"
                  >
                    <RefreshCw class="h-3.5 w-3.5" />
                    <span>ပြန်လည် ကြိုးစားမည်</span>
                  </button>
                </div>
              </div>
            </Transition>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Silky-smooth step fade and subtle glide */
.step-fade-enter-active,
.step-fade-leave-active {
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.step-fade-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}
.step-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.985);
}
</style>
