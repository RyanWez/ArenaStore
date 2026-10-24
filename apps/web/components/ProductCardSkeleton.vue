<template>
  <div class="rounded-2xl border border-arena-border/80 bg-arena-surface p-5 sm:p-6 flex flex-col justify-between space-y-5 animate-pulse min-h-[215px] sm:min-h-[230px]">
    <!-- Top Row: Icon + Badges -->
    <div class="flex items-start justify-between">
      <div class="h-12 w-12 sm:h-[52px] sm:w-[52px] rounded-2xl bg-arena-elevated" />
      <div class="flex items-center space-x-2">
        <div class="h-5 w-14 rounded-full bg-arena-elevated" />
        <div class="h-5 w-16 rounded-full bg-arena-elevated" />
      </div>
    </div>

    <!-- Middle Row: Title + Subtitle -->
    <div class="space-y-2">
      <div class="h-5 w-4/5 rounded bg-arena-elevated" />
      <div class="h-3.5 w-3/5 rounded bg-arena-elevated/60" />
    </div>

    <!-- Bottom Row: Price + Button -->
    <div class="border-t border-arena-border/50 pt-4 flex items-center justify-between">
      <div class="h-7 w-28 rounded bg-arena-elevated" />
      <div class="h-9 w-24 rounded-xl bg-arena-elevated" />
    </div>
  </div>
</template>
