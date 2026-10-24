<script setup lang="ts">
import { ref } from "vue";
import { Search, Zap, ShieldCheck, CreditCard, Headphones } from "lucide-vue-next";
import HeroCardDeck from "~/components/HeroCardDeck.vue";
import CategoryPillBar from "~/components/CategoryPillBar.vue";
import ProductGrid from "~/components/ProductGrid.vue";
import { useStoreCatalog, type StoreProduct } from "~/composables/useStoreCatalog";
import { useStoreAuth } from "~/composables/useStoreAuth";

const { fetchCatalog, searchQuery } = useStoreCatalog();
const { isAuthenticated, openLoginModal } = useStoreAuth();

const route = useRoute();
const localSearchInput = ref("");
let searchDebounceTimer: NodeJS.Timeout | null = null;

// Prefetch catalog for instant zero-flash SSR
await useAsyncData("master_catalog_init", async () => {
  await fetchCatalog();
  return true;
});

onMounted(() => {
  if (route.hash === "#catalog") {
    nextTick(() => {
      setTimeout(() => {
        const el = document.getElementById("catalog");
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
        }
      }, 150);
    });
  }
});

// Live real-time reactive search filtering with 120ms debounce
const onSearchInput = () => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    searchQuery.value = localSearchInput.value.trim();
  }, 120);
};

const handleSearchSubmit = () => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchQuery.value = localSearchInput.value.trim();
  if (typeof document !== "undefined") {
    const el = document.getElementById("catalog");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }
};

const handleBuyProduct = (product: StoreProduct) => {
  console.log("[Storefront] Product chosen for purchase:", product.name, product.id);
  if (!isAuthenticated.value) {
    openLoginModal(`"${product.name}" ကို ဝယ်ယူရန် Telegram အကောင့်ဖြင့် အရင်ဆုံး Login ဝင်ရောက်ပေးပါခင်ဗျာ။`);
  }
};

useHead({
  title: "Arena Store — Pay. Tap. Done.",
  meta: [
    {
      name: "description",
      content: "Get premium apps, memberships and digital tools in seconds. Trusted, fast and hassle-free — only at Arena Store.",
    },
  ],
});
</script>

<template>
  <div class="space-y-12 animate-fade-in pb-12">
    <!-- 1. Hero Section matching desktop_storefront.png -->
    <section class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center pt-2 sm:pt-4">
      <!-- Left Column: Headline, Search Pill & Trust Badges -->
      <div class="lg:col-span-6 space-y-6 text-left">
        <!-- Subtitle Label -->
        <div class="text-[11px] font-bold uppercase tracking-widest text-arena-muted">
          PREMIUM DIGITAL PRODUCTS FOR A SMARTER YOU
        </div>

        <!-- Huge Bold Headline: Pay. Tap. Done. -->
        <h1 class="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.05]">
          Pay. Tap. Done<span class="text-white">.</span>
        </h1>

        <!-- Paragraph Description -->
        <p class="text-sm sm:text-base text-arena-muted max-w-lg leading-relaxed">
          Get premium apps, memberships and digital tools in seconds. Trusted, fast and hassle-free — only at Arena Store.
        </p>

        <!-- Integrated Search Pill Input with instant live filtering -->
        <form @submit.prevent="handleSearchSubmit" class="relative w-full max-w-md">
          <div class="relative flex items-center rounded-full border border-arena-border bg-[#0E1015] p-1.5 shadow-xl transition-all focus-within:border-arena-border-strong">
            <div class="pl-3.5 pr-2 flex items-center pointer-events-none text-arena-muted">
              <Search class="h-4 w-4" />
            </div>
            <input
              v-model="localSearchInput"
              @input="onSearchInput"
              type="text"
              placeholder="Search for apps, memberships, tools..."
              class="w-full bg-transparent text-xs sm:text-sm text-white placeholder-arena-subtle focus:outline-none"
            />
            <button
              type="submit"
              class="rounded-full bg-arena-orange px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-arena-orange-hover active:scale-95 shrink-0 shadow-sm"
            >
              Search
            </button>
          </div>
        </form>

        <!-- Trust Badges Row (4 Items) -->
        <div class="flex flex-wrap items-center gap-4 sm:gap-6 pt-2 text-xs text-arena-muted font-medium">
          <div class="flex items-center space-x-1.5">
            <Zap class="h-3.5 w-3.5 text-arena-muted" />
            <span>Instant Delivery</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <ShieldCheck class="h-3.5 w-3.5 text-arena-muted" />
            <span>100% Legit</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <CreditCard class="h-3.5 w-3.5 text-arena-muted" />
            <span>Secure Payments</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <Headphones class="h-3.5 w-3.5 text-arena-muted" />
            <span>24/7 Support</span>
          </div>
        </div>
      </div>

      <!-- Right Column: 3D Luxury Metallic Card Stack on Podium -->
      <div class="lg:col-span-6 flex items-center justify-center">
        <HeroCardDeck @buy-card="handleBuyProduct" />
      </div>
    </section>

    <!-- 2. Catalog Section (Category Pill Bar + Product Grid unified under #catalog) -->
    <section id="catalog" class="scroll-mt-16 pt-1 space-y-6">
      <CategoryPillBar />
      <ProductGrid @buy-product="handleBuyProduct" />
    </section>
  </div>
</template>

