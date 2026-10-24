<script setup lang="ts">
import { ref } from "vue";
import { X, ShieldCheck, Eye, EyeOff, Copy, Check, Lock, KeyRound } from "lucide-vue-next";

const props = defineProps<{
  isOpen: boolean;
  order: {
    id: string | number;
    productName: string;
    tierName?: string;
    keyOrCredentials?: string;
    date?: string;
  } | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const isRevealed = ref(false);
const isCopied = ref(false);

const toggleReveal = () => {
  isRevealed.value = !isRevealed.value;
};

const copyCredentials = async () => {
  if (!props.order?.keyOrCredentials) return;
  try {
    await navigator.clipboard.writeText(props.order.keyOrCredentials);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  } catch (err) {
    console.warn("Failed to copy:", err);
  }
};
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
        v-if="isOpen && order"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      >
        <!-- Persistent Backdrop -->
        <div class="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity" />

        <!-- Modal Dialog -->
        <Transition
          enter-active-class="transition duration-300 cubic-bezier(0.16, 1, 0.3, 1)"
          enter-from-class="opacity-0 scale-95 translate-y-3"
          enter-to-class="opacity-100 scale-100 translate-y-0"
          leave-active-class="transition duration-200 ease-in"
          leave-from-class="opacity-100 scale-100 translate-y-0"
          leave-to-class="opacity-0 scale-95 translate-y-2"
        >
          <div
            class="relative w-full max-w-md rounded-3xl border border-arena-border/80 bg-gradient-to-b from-[#181A24] via-[#0E1016] to-[#0A0C10] p-6 text-white shadow-2xl overflow-hidden"
            @click.stop
          >
            <!-- Top Orange Ambient Light -->
            <div class="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-40 w-72 rounded-full bg-arena-orange/15 blur-3xl" />

            <!-- Header Row -->
            <div class="relative z-10 flex items-center justify-between pb-3 border-b border-arena-border/50">
              <div class="flex items-center space-x-2 text-xs font-semibold text-emerald-400">
                <div class="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <ShieldCheck class="h-3.5 w-3.5" />
                </div>
                <span>Encrypted Credentials Vault</span>
              </div>

              <button
                type="button"
                @click="emit('close')"
                class="flex h-8 w-8 items-center justify-center rounded-full text-arena-muted hover:text-white hover:bg-white/10 transition-colors"
              >
                <X class="h-4 w-4" />
              </button>
            </div>

            <!-- Content Area -->
            <div class="relative z-10 py-5 space-y-4">
              <!-- Order Info Summary -->
              <div class="space-y-1">
                <div class="text-[10px] font-mono text-arena-muted uppercase tracking-wider">
                  Order #{{ order.id }} · {{ order.date || 'Completed' }}
                </div>
                <h3 class="text-xl font-black text-white tracking-tight">
                  {{ order.productName }}
                </h3>
                <div v-if="order.tierName" class="inline-flex items-center px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-arena-muted">
                  {{ order.tierName }}
                </div>
              </div>

              <!-- Encrypted / Revealed Key Box -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-xs font-medium text-arena-muted px-1">
                  <span>License Key / Account Credentials</span>
                  <button
                    type="button"
                    @click="toggleReveal"
                    class="inline-flex items-center space-x-1 text-arena-orange hover:text-arena-orange-hover transition-colors font-semibold"
                  >
                    <component :is="isRevealed ? EyeOff : Eye" class="h-3.5 w-3.5" />
                    <span>{{ isRevealed ? "ဝှက်မည်" : "ကြည့်ရှုမည်" }}</span>
                  </button>
                </div>

                <div class="relative flex items-center rounded-2xl border border-arena-border/80 bg-[#0E1015] p-3 shadow-inner">
                  <div class="font-mono text-xs sm:text-sm text-white select-all w-full truncate">
                    <template v-if="isRevealed">
                      {{ order.keyOrCredentials || "ARX3-7F9K-2Q1M-XXXX" }}
                    </template>
                    <template v-else>
                      ••••-••••-••••-••••
                    </template>
                  </div>

                  <!-- 1-Click Copy Button -->
                  <button
                    type="button"
                    @click="copyCredentials"
                    class="ml-2 flex h-9 w-9 items-center justify-center rounded-xl bg-arena-orange hover:bg-arena-orange-hover text-white transition-colors shrink-0 shadow-md shadow-arena-orange/20"
                    title="Copy Key"
                  >
                    <component :is="isCopied ? Check : Copy" class="h-4 w-4" />
                  </button>
                </div>
              </div>

              <!-- Security Notice -->
              <div class="rounded-2xl border border-arena-border/60 bg-[#12141C]/80 p-3 text-[11px] text-arena-muted leading-relaxed flex items-start space-x-2.5">
                <Lock class="h-4 w-4 text-arena-orange shrink-0 mt-0.5" />
                <span>
                  လုံခြုံရေးအရ ဤ Credential ကို အခြားသူများအား မျှဝေခြင်း မပြုပါနှင့်။ သင့် Telegram Bot ထဲသို့လည်း မိတ္တူ ပေးပို့ထားပြီး ဖြစ်ပါသည်။
                </span>
              </div>
            </div>

            <!-- Footer Action -->
            <div class="relative z-10 pt-1">
              <button
                type="button"
                @click="emit('close')"
                class="w-full rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 py-3 text-xs font-bold text-white transition-colors"
              >
                ပိတ်မည် (Close)
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
