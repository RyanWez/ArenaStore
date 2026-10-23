<script setup lang="ts">
import { ShieldCheck, Zap, Sparkles, ArrowRight, Wallet } from "lucide-vue-next";
import { useStoreAuth } from "~/composables/useStoreAuth";

const { user, balanceMmk, isAuthenticated, formatMmk } = useStoreAuth();
</script>

<template>
  <div class="space-y-8 animate-fade-in">
    <!-- Hero Header Banner (2026 Flat Monolithic) -->
    <section class="rounded-2xl border border-arena-border bg-arena-surface p-6 sm:p-8 relative overflow-hidden">
      <div class="max-w-2xl space-y-4">
        <!-- Status Pill -->
        <div class="inline-flex items-center space-x-2 rounded-full border border-arena-orange/20 bg-arena-orange-subtle px-3 py-1 text-xs font-semibold text-arena-orange">
          <Sparkles class="h-3.5 w-3.5" />
          <span>PREMIUM DIGITAL STOREFRONT</span>
        </div>

        <h1 class="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
          Arena Store Digital Accounts & Instant Licenses
        </h1>

        <p class="text-sm sm:text-base text-arena-muted leading-relaxed">
          ChatGPT Plus, Canva Pro, YouTube Premium, and developer subscriptions delivered instantly via your prepaid MMK wallet.
        </p>

        <!-- Live Auth Status Badge -->
        <div class="pt-2 flex flex-wrap gap-3 items-center">
          <div
            v-if="isAuthenticated && user"
            class="flex items-center space-x-2 rounded-lg border border-arena-border bg-arena-elevated px-3 py-1.5 text-xs text-arena-text"
          >
            <ShieldCheck class="h-4 w-4 text-arena-emerald" />
            <span>Signed in as <strong class="text-white">{{ user.firstName }}</strong></span>
            <span class="text-arena-subtle">•</span>
            <span class="font-mono text-arena-orange font-semibold">{{ formatMmk(balanceMmk) }}</span>
          </div>
          <div
            v-else
            class="flex items-center space-x-2 rounded-lg border border-arena-border bg-arena-elevated px-3 py-1.5 text-xs text-arena-muted"
          >
            <Zap class="h-4 w-4 text-arena-orange" />
            <span>Connect with Telegram to purchase</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Sub-Phase 2B Showcase Placeholder / Catalog Section -->
    <section id="catalog" class="scroll-mt-20 rounded-2xl border border-dashed border-arena-border bg-arena-surface/50 p-8 text-center space-y-3">
      <div class="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-arena-elevated border border-arena-border text-arena-orange">
        <Sparkles class="h-5 w-5" />
      </div>
      <h3 class="text-base font-bold text-white">Sub-Phase 2A Foundation Operational</h3>
      <p class="text-xs text-arena-muted max-w-md mx-auto">
        Next step: Sub-Phase 2B will mount the signature 3D Card Stack Carousel, Category Momentum Scrollbar, and 2-Column Bento Product Grid right here!
      </p>
    </section>
  </div>
</template>
