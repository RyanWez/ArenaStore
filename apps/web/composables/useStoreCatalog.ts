import { ref, computed } from "vue";
import { parseCustomEmoji } from "@arena/shared";
import { MASTER_PRODUCTS, MASTER_CATEGORIES, type MasterProduct } from "~/data/master-catalog";

export interface StoreCategory {
  id: string | number;
  label: string;
  icon: string;
  count?: number;
}

export function useStoreCatalog() {
  const masterProducts = useState<MasterProduct[]>("master_products_list", () => [...MASTER_PRODUCTS]);
  const selectedCategoryId = useState<string>("master_selected_cat", () => "all");
  const searchQuery = useState<string>("master_search_query", () => "");
  const isLoading = useState<boolean>("master_catalog_loading", () => false);

  const formatPrice = (priceMmk: number): string => {
    return new Intl.NumberFormat("en-US").format(priceMmk) + " Ks";
  };

  const fetchCatalog = async () => {
    isLoading.value = true;
    try {
      const prodRes = await $fetch<{ products?: any[]; data?: any[] }>("/api/catalog/products").catch(() => null);

      if (prodRes) {
        const rawProds = prodRes.products || prodRes.data || [];
        // Seamlessly merge live pricing & sellable stock from DB into master catalog
        masterProducts.value = masterProducts.value.map((mp) => {
          const matched = rawProds.find((rp: any) => {
            const name = (rp.nameMmk || rp.rawName || "").toLowerCase();
            return name.includes(mp.brand) || name.includes(mp.slug.replace("-", " "));
          });

          if (matched) {
            return {
              ...mp,
              id: matched.id ?? mp.id,
              priceMmk: matched.retailPriceMmk ?? mp.priceMmk,
              formattedPrice: matched.formattedRetailPriceMmk || formatPrice(matched.retailPriceMmk),
              stockStatus: (matched.sellableStock ?? 1) > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
            };
          }
          return mp;
        });
      }
    } catch (err) {
      console.error("[useStoreCatalog] Error syncing live catalog:", err);
    } finally {
      isLoading.value = false;
    }
  };

  const filteredProducts = computed(() => {
    let list = masterProducts.value;

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
    return [
      masterProducts.value.find((p) => p.brand === "chatgpt") || masterProducts.value[0]!,
      masterProducts.value.find((p) => p.brand === "capcut") || masterProducts.value[1]!,
      masterProducts.value.find((p) => p.brand === "canva") || masterProducts.value[2]!,
    ];
  });

  const selectCategory = (catId: string) => {
    selectedCategoryId.value = catId;
  };

  return {
    categories: MASTER_CATEGORIES,
    products: masterProducts,
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
