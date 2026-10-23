<script setup lang="ts">
import { Home, LayoutGrid, Package, User } from "lucide-vue-next";
import { SITE_CONFIG } from "~/config/site";

const route = useRoute();

const iconMap: Record<string, any> = {
  Home,
  LayoutGrid,
  Package,
  User,
};

const tabs = computed(() => {
  return SITE_CONFIG.bottomNav.map((item) => ({
    ...item,
    icon: (item.icon && iconMap[item.icon]) ? iconMap[item.icon] : Home,
  }));
});

const isActive = (tabPath: string): boolean => {
  if (tabPath === "/") return route.path === "/" && !route.hash;
  if (tabPath.startsWith("/#")) return route.hash === tabPath.replace("/", "");
  return route.path.startsWith(tabPath);
};
</script>

<template>
  <nav
    class="fixed bottom-0 left-0 right-0 z-40 border-t border-arena-border bg-arena-surface/90 backdrop-blur-lg md:hidden transition-all"
    style="padding-bottom: max(10px, env(safe-area-inset-bottom, 10px));"
  >
    <div class="mx-auto grid grid-cols-4 max-w-md pt-2">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.path"
        :to="tab.path"
        class="flex flex-col items-center justify-center space-y-1 py-1 transition-colors relative"
      >
        <component
          :is="tab.icon"
          class="h-5 w-5 transition-colors"
          :class="isActive(tab.path) ? 'text-arena-orange' : 'text-arena-muted'"
        />
        <span
          class="text-[10px] tracking-tight transition-colors"
          :class="isActive(tab.path) ? 'text-white font-semibold' : 'text-arena-subtle font-medium'"
        >
          {{ tab.label }}
        </span>
        <!-- Active Pill Indicator -->
        <span
          v-if="isActive(tab.path)"
          class="absolute -bottom-1 h-0.5 w-3 rounded-full bg-arena-orange"
        />
      </NuxtLink>
    </div>
  </nav>
</template>
