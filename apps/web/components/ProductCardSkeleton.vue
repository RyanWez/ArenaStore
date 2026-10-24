<template>
  <div class="rounded-2xl border border-arena-border bg-arena-surface p-4 sm:p-5 flex flex-col justify-between space-y-4 animate-pulse">
    <!-- Top Row: Icon + Badge -->
    <div class="flex items-center justify-between">
      <div class="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-arena-elevated" />
      <div class="h-5 w-16 rounded-full bg-arena-elevated" />
    </div>

    <!-- Middle Row: Title + Subtitle -->
    <div class="space-y-2">
      <div class="h-4 w-3/4 rounded bg-arena-elevated" />
      <div class="h-3 w-1/2 rounded bg-arena-elevated/60" />
    </div>

    <!-- Bottom Row: Price + Button -->
    <div class="border-t border-arena-border/50 pt-3 flex items-center justify-between">
      <div class="h-5 w-20 rounded bg-arena-elevated" />
      <div class="h-8 w-16 sm:w-20 rounded-lg bg-arena-elevated" />
    </div>
  </div>
</template>
