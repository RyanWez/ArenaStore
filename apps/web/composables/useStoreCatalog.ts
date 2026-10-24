import { computed } from "vue";
import { MASTER_CATEGORIES } from "~/data/master-catalog";
import { parseProductTitleAndTerm } from "~/data/brand-registry";

export interface StoreProduct {
  id: string | number;
  slug: string;
  name: string;
  subtitle: string;
  category: "all" | "ai" | "design" | "video" | "dev" | "entertainment" | "business";
  priceMmk: number;
  formattedPrice: string;
  durationLabel: string;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  sellableStock: number;
  brand: string;
  deliveryType: string;
}

const BRAND_THEMATIC_CATEGORY: Record<string, StoreProduct["category"]> = {
  chatgpt: "ai",
  gemini: "ai",
  muse: "ai",
  claude: "ai",
  notion: "ai",
  capcut: "video",
  canva: "design",
  adobe: "design",
  midjourney: "design",
  figma: "design",
  youtube: "entertainment",
  netflix: "entertainment",
  spotify: "entertainment",
  prime: "entertainment",
  xbox: "entertainment",
  telegram: "entertainment",
  discord: "entertainment",
  microsoft: "business",
  duolingo: "ai",
  coursera: "ai",
  vpn: "dev",
  lovable: "dev",
};

const BRAND_DEFAULT_SUBTITLES: Record<string, string> = {
  capcut: "Edit like a pro. Without limits.",
  canva: "Design anything. Anywhere.",
  chatgpt: "Higher limits. Smarter conversations.",
  youtube: "Ad-free. Offline. Background play.",
  netflix: "Movies, Series. 4K UHD streaming.",
  spotify: "Music for every moment.",
  gemini: "Advanced Google AI ecosystem.",
  duolingo: "Learn faster with Super perks.",
  telegram: "Premium verified account access.",
  notion: "Connected workspace & docs.",
  adobe: "Full Creative Cloud app suite.",
  midjourney: "Photorealistic generative AI.",
  muse: "High-speed AI tokens & credits.",
  microsoft: "Word, Excel, PowerPoint & Cloud.",
};

export function useStoreCatalog() {
  const products = useState<StoreProduct[]>("live_products_list", () => []);
  const selectedCategoryId = useState<string>("master_selected_cat", () => "all");
  const searchQuery = useState<string>("master_search_query", () => "");
  const isLoading = useState<boolean>("master_catalog_loading", () => false);
  const isError = useState<boolean>("master_catalog_error", () => false);
  const errorMessage = useState<string | null>("master_catalog_error_msg", () => null);
  const isRetrying = useState<boolean>("master_catalog_retrying", () => false);

  const formatPrice = (priceMmk: number): string => {
    return new Intl.NumberFormat("en-US").format(priceMmk) + " Ks";
  };

  const fetchCatalog = async (isManualRetry = false) => {
    if (isManualRetry) {
      isRetrying.value = true;
    } else {
      isLoading.value = true;
    }
    isError.value = false;
    errorMessage.value = null;

    try {
      // Auto-retry once on network glitch with 1.2s delay
      let prodRes: { products?: any[]; ok?: boolean } | null = null;
      let attempt = 0;
      const maxAttempts = 2;

      while (attempt < maxAttempts) {
        try {
          prodRes = await $fetch<{ products?: any[]; ok?: boolean }>("/api/catalog/products", {
            timeout: 8000,
          });
          if (prodRes && prodRes.ok) break;
        } catch (e) {
          attempt++;
          if (attempt >= maxAttempts) throw e;
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }

      if (prodRes && Array.isArray(prodRes.products)) {
        // Transform live DB products into normalized StoreProduct
        const liveList: StoreProduct[] = prodRes.products.map((rp: any) => {
          const rawTitle = rp.nameMmk || rp.rawName || "Digital Product";
          const parsed = parseProductTitleAndTerm(rawTitle);

          let subtitle = BRAND_DEFAULT_SUBTITLES[parsed.brand] || "Official digital subscription";
          if (rp.descriptionMmk || rp.rawDescription) {
            const firstLine = (rp.descriptionMmk || rp.rawDescription)
              .split("\n")[0]
              .replace(/\{pe:\d+\}/g, "")
              .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
              .trim();
            if (firstLine && firstLine.length > 5 && firstLine.length < 60) {
              subtitle = firstLine;
            }
          }

          const category = BRAND_THEMATIC_CATEGORY[parsed.brand] || "all";
          const sellableStock = rp.sellableStock ?? 0;
          const stockStatus = sellableStock > 0 ? "IN_STOCK" : "OUT_OF_STOCK";

          return {
            id: rp.id,
            slug: `${parsed.brand}-${rp.id}`,
            name: parsed.cleanTitle,
            subtitle,
            category,
            priceMmk: rp.retailPriceMmk ?? 0,
            formattedPrice: rp.formattedRetailPriceMmk || formatPrice(rp.retailPriceMmk ?? 0),
            durationLabel: parsed.durationLabel,
            stockStatus,
            sellableStock,
            brand: parsed.brand,
            deliveryType: rp.deliveryType || "INSTANT",
          };
        });

        products.value = liveList;
        isError.value = false;
      } else {
        // API returned unsuccessful without products: do NOT fallback to mock data
        products.value = [];
        isError.value = true;
        errorMessage.value = "ဆာဗာမှ ဒေတာ မရရှိနိုင်သေးပါခင်ဗျာ။ ခဏအကြာတွင် ပြန်လည် စမ်းသပ်ပေးပါ။";
      }
    } catch (err: any) {
      console.error("[useStoreCatalog] Error syncing live catalog:", err);
      products.value = [];
      isError.value = true;
      errorMessage.value = "ဆာဗာ ချိတ်ဆက်မှု ယာယီ ပြတ်တောက်နေပါသည်ခင်ဗျာ။ ခဏအကြာတွင် ပြန်လည် စမ်းသပ်ပေးပါ။";
    } finally {
      isLoading.value = false;
      isRetrying.value = false;
    }
  };

  const retrySync = async () => {
    await fetchCatalog(true);
  };

  const filteredProducts = computed(() => {
    let list = products.value;

    if (selectedCategoryId.value && selectedCategoryId.value !== "all") {
      list = list.filter((p) => p.category === selectedCategoryId.value);
    }

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      list = list.filter((p) => {
        return (
          p.name.toLowerCase().includes(q) ||
          p.subtitle.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q)
        );
      });
    }

    return list;
  });

  const featuredCards = computed(() => {
    if (products.value.length === 0) return [];

    // Look up corresponding live products from DB
    const geminiLive = products.value.find((p) => p.brand === "gemini" && p.sellableStock > 0) ||
      products.value.find((p) => p.brand === "gemini");
    const capcutLive = products.value.find((p) => p.brand === "capcut" && p.sellableStock > 0) ||
      products.value.find((p) => p.brand === "capcut");
    const youtubeLive = products.value.find((p) => p.brand === "youtube" && p.sellableStock > 0) ||
      products.value.find((p) => p.brand === "youtube");

    const cards: StoreProduct[] = [];
    if (geminiLive) cards.push(geminiLive);
    if (capcutLive) cards.push(capcutLive);
    if (youtubeLive) cards.push(youtubeLive);

    // If specific brands aren't in DB, populate up to 3 cards with other in-stock live products
    if (cards.length < 3) {
      for (const p of products.value) {
        if (!cards.some((c) => c.id === p.id)) {
          cards.push(p);
          if (cards.length >= 3) break;
        }
      }
    }

    return cards;
  });

  const selectCategory = (catId: string) => {
    selectedCategoryId.value = catId;
  };

  return {
    categories: MASTER_CATEGORIES,
    products,
    selectedCategoryId,
    searchQuery,
    isLoading,
    isError,
    errorMessage,
    isRetrying,
    filteredProducts,
    featuredCards,
    fetchCatalog,
    retrySync,
    selectCategory,
    formatPrice,
  };
}
