import { ref, computed } from "vue";
import { MASTER_CATEGORIES, MASTER_PRODUCTS, type MasterProduct } from "~/data/master-catalog";
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

  const formatPrice = (priceMmk: number): string => {
    return new Intl.NumberFormat("en-US").format(priceMmk) + " Ks";
  };

  const fetchCatalog = async () => {
    isLoading.value = true;
    try {
      const prodRes = await $fetch<{ products?: any[]; ok?: boolean }>("/api/catalog/products").catch(() => null);

      if (prodRes && prodRes.products && prodRes.products.length > 0) {
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
      } else {
        // Fallback to Master Catalog if API is empty or unreachable
        products.value = MASTER_PRODUCTS.map((mp) => ({
          ...mp,
          formattedPrice: formatPrice(mp.priceMmk),
          durationLabel: "/ month",
          sellableStock: mp.stockStatus === "IN_STOCK" ? 10 : 0,
        }));
      }
    } catch (err) {
      console.error("[useStoreCatalog] Error syncing live catalog:", err);
      if (products.value.length === 0) {
        products.value = MASTER_PRODUCTS.map((mp) => ({
          ...mp,
          formattedPrice: formatPrice(mp.priceMmk),
          durationLabel: "/ month",
          sellableStock: 10,
        }));
      }
    } finally {
      isLoading.value = false;
    }
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
    // Look up corresponding live products from DB, with fallback to real catalog definitions
    const geminiLive = products.value.find((p) => p.brand === "gemini" && p.sellableStock > 0) ||
      products.value.find((p) => p.brand === "gemini");
    const capcutLive = products.value.find((p) => p.brand === "capcut" && p.sellableStock > 0) ||
      products.value.find((p) => p.brand === "capcut");
    const youtubeLive = products.value.find((p) => p.brand === "youtube" && p.sellableStock > 0) ||
      products.value.find((p) => p.brand === "youtube");

    return [
      geminiLive || {
        id: "gemini-pro-18m",
        slug: "gemini-pro-18m",
        name: "Gemini Pro",
        subtitle: "Google Advanced AI ecosystem.",
        category: "ai" as const,
        priceMmk: 8200,
        formattedPrice: "8,200 Ks",
        durationLabel: "/ 18 months",
        stockStatus: "IN_STOCK" as const,
        sellableStock: 9,
        brand: "gemini",
        deliveryType: "LINK",
      },
      capcutLive || {
        id: "capcut-1m",
        slug: "capcut-1m",
        name: "CapCut Pro",
        subtitle: "Edit without limits.",
        category: "video" as const,
        priceMmk: 6800,
        formattedPrice: "6,800 Ks",
        durationLabel: "/ 1 month",
        stockStatus: "IN_STOCK" as const,
        sellableStock: 4,
        brand: "capcut",
        deliveryType: "TEXT",
      },
      youtubeLive || {
        id: "youtube-premium-3m",
        slug: "youtube-premium-3m",
        name: "YouTube Premium",
        subtitle: "Ad-free, offline background play.",
        category: "entertainment" as const,
        priceMmk: 9600,
        formattedPrice: "9,600 Ks",
        durationLabel: "/ 3 months",
        stockStatus: "IN_STOCK" as const,
        sellableStock: 7,
        brand: "youtube",
        deliveryType: "LINK",
      },
    ];
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
    filteredProducts,
    featuredCards,
    fetchCatalog,
    selectCategory,
    formatPrice,
  };
}
