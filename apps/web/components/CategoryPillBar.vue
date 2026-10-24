<script setup lang="ts">
import { ref } from "vue";
import {
  LayoutGrid,
  Brain,
  Palette,
  Video,
  Users,
  Code,
  ShieldCheck,
  Tv,
  Briefcase,
  ChevronRight,
} from "lucide-vue-next";
import { useStoreCatalog } from "~/composables/useStoreCatalog";

const { categories, selectedCategoryId, selectCategory } = useStoreCatalog();

const scrollContainer = ref<HTMLElement | null>(null);

const iconMap: Record<string, any> = {
  LayoutGrid,
  Brain,
  Palette,
  Video,
  Users,
  Code,
  ShieldCheck,
  Tv,
  Briefcase,
};

const scrollRight = () => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollBy({ left: 200, behavior: "smooth" });
  }
};
</script>

<template>
  <div class="relative w-full flex items-center">
    <!-- Horizontal Scrollable Track -->
    <div
      ref="scrollContainer"
      class="flex items-center space-x-2.5 overflow-x-auto py-2 no-scrollbar scroll-smooth flex-1 pr-10"
      style="-webkit-overflow-scrolling: touch;"
    >
      <button
        v-for="cat in categories"
        :key="cat.id"
        type="button"
        @click="selectCategory(cat.id)"
        class="group flex items-center space-x-2 shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-150 border select-none active:scale-95"
        :class="[
          selectedCategoryId === cat.id
            ? 'bg-white border-white text-black shadow-md'
            : 'bg-[#101216] border-[#1F232D] text-arena-muted hover:border-[#374151] hover:text-white hover:bg-[#161920]'
        ]"
      >
        <component
          :is="iconMap[cat.icon] || LayoutGrid"
          class="h-3.5 w-3.5 transition-colors"
          :class="selectedCategoryId === cat.id ? 'text-black' : 'text-arena-muted group-hover:text-white'"
        />
        <span>{{ cat.label }}</span>
      </button>
    </div>

    <!-- Right Scroll Arrow -->
    <button
      type="button"
      @click="scrollRight"
      class="hidden sm:flex h-8 w-8 items-center justify-center rounded-full border border-arena-border bg-arena-surface text-arena-muted hover:text-white hover:border-arena-border-strong transition-colors ml-2 shrink-0 shadow-sm"
      title="Scroll Categories"
    >
      <ChevronRight class="h-4 w-4" />
    </button>
  </div>
</template>
