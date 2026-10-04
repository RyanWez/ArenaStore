import { and, asc, eq, gte, sql } from "drizzle-orm";
import { getDb, orders, orderItems, products, categories, appSettings } from "@arena/db";
import { stripCustomEmojiPlaceholders } from "@arena/shared";

export interface AnalyticsFilterParams {
  preset?: string;
  customDate?: string;
  startDate?: string;
  endDate?: string;
}

export interface AnalyticsSummary {
  totalRevenueMmk: number;
  totalCostMmk: number;
  totalCostUsd: number;
  grossProfitMmk: number;
  profitMarginPct: number;
  deliveredOrdersCount: number;
  avgOrderValueMmk: number;
  refundedOrdersCount: number;
  refundedAmountMmk: number;
  exchangeRateUsed: number;
}

export interface AnalyticsTrendPoint {
  label: string;
  date: string;
  revenueMmk: number;
  costMmk: number;
  profitMmk: number;
  ordersCount: number;
}

export interface AnalyticsCategory {
  categoryId: number | null;
  categoryName: string;
  revenueMmk: number;
  costMmk: number;
  profitMmk: number;
  profitSharePct: number;
  orderCount: number;
}

export interface AnalyticsProductBreakdown {
  productId: number;
  productName: string;
  categoryName: string;
  unitsSold: number;
  revenueMmk: number;
  costMmk: number;
  profitMmk: number;
  profitSharePct: number;
  orderCount: number;
}

export interface AnalyticsTopProduct {
  productId: number;
  productName: string;
  categoryName: string;
  unitsSold: number;
  revenueMmk: number;
  costMmk: number;
  profitMmk: number;
  marginPct: number;
}

export interface AnalyticsResponseData {
  periodLabel: string;
  preset: string;
  summary: AnalyticsSummary;
  trend: AnalyticsTrendPoint[];
  categories: AnalyticsCategory[];
  products: AnalyticsProductBreakdown[];
  topProducts: AnalyticsTopProduct[];
}

const MM_OFFSET_MS = (6 * 60 + 30) * 60 * 1000;

export function getMyanmarDateBounds(
  preset = "TODAY",
  customDate?: string,
  startDate?: string,
  endDate?: string
): { startUtc: Date | null; endUtc: Date | null; label: string; mode: "HOURLY" | "DAILY" } {
  const now = new Date();
  const nowMmMs = now.getTime() + MM_OFFSET_MS;
  const mmNowDate = new Date(nowMmMs);
  const mmYear = mmNowDate.getUTCFullYear();
  const mmMonth = mmNowDate.getUTCMonth(); // 0-indexed
  const mmDay = mmNowDate.getUTCDate();

  const createMmDayUtcBounds = (y: number, m: number, d: number) => {
    const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - MM_OFFSET_MS);
    const endUtc = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - MM_OFFSET_MS);
    return { startUtc, endUtc };
  };

  const normPreset = (preset || "TODAY").toUpperCase();

  if (normPreset === "TODAY") {
    const { startUtc, endUtc } = createMmDayUtcBounds(mmYear, mmMonth, mmDay);
    return { startUtc, endUtc, label: "Today", mode: "HOURLY" };
  }

  if (normPreset === "YESTERDAY") {
    const yesterdayMm = new Date(nowMmMs - 24 * 60 * 60 * 1000);
    const { startUtc, endUtc } = createMmDayUtcBounds(
      yesterdayMm.getUTCFullYear(),
      yesterdayMm.getUTCMonth(),
      yesterdayMm.getUTCDate()
    );
    return { startUtc, endUtc, label: "Yesterday", mode: "HOURLY" };
  }

  if (normPreset === "LAST_7_DAYS") {
    const sevenDaysAgoMm = new Date(nowMmMs - 6 * 24 * 60 * 60 * 1000);
    const startUtc = new Date(
      Date.UTC(
        sevenDaysAgoMm.getUTCFullYear(),
        sevenDaysAgoMm.getUTCMonth(),
        sevenDaysAgoMm.getUTCDate(),
        0,
        0,
        0,
        0
      ) - MM_OFFSET_MS
    );
    const endUtc = new Date(Date.UTC(mmYear, mmMonth, mmDay, 23, 59, 59, 999) - MM_OFFSET_MS);
    return { startUtc, endUtc, label: "Last 7 Days", mode: "DAILY" };
  }

  if (normPreset === "THIS_MONTH") {
    const startUtc = new Date(Date.UTC(mmYear, mmMonth, 1, 0, 0, 0, 0) - MM_OFFSET_MS);
    const endUtc = new Date(Date.UTC(mmYear, mmMonth, mmDay, 23, 59, 59, 999) - MM_OFFSET_MS);
    return { startUtc, endUtc, label: "This Month", mode: "DAILY" };
  }

  if (normPreset === "CUSTOM" || customDate || startDate) {
    if (startDate && endDate) {
      const [sy, sm, sd] = startDate.split("-").map(Number);
      const [ey, em, ed] = endDate.split("-").map(Number);
      const startUtc = new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0) - MM_OFFSET_MS);
      const endUtc = new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59, 999) - MM_OFFSET_MS);
      const mode = startDate === endDate ? "HOURLY" : "DAILY";
      return { startUtc, endUtc, label: `${startDate} to ${endDate}`, mode };
    }
    const cDate = customDate || startDate;
    if (cDate) {
      const [y, m, d] = cDate.split("-").map(Number);
      const { startUtc, endUtc } = createMmDayUtcBounds(y, m - 1, d);
      return { startUtc, endUtc, label: cDate, mode: "HOURLY" };
    }
  }

  // 'ALL'
  return { startUtc: null, endUtc: null, label: "All Time", mode: "DAILY" };
}

function getMyanmarDateKey(d: Date): string {
  const mmTime = new Date(d.getTime() + MM_OFFSET_MS);
  const y = mmTime.getUTCFullYear();
  const m = String(mmTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(mmTime.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMyanmarHour(d: Date): number {
  const mmTime = new Date(d.getTime() + MM_OFFSET_MS);
  return mmTime.getUTCHours();
}

function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d).padStart(2, "0")} ${monthNames[m - 1] || ""}`;
}

export async function getAnalytics(params: AnalyticsFilterParams): Promise<AnalyticsResponseData> {
  const db = getDb();
  const { startUtc, endUtc, label: periodLabel, mode } = getMyanmarDateBounds(
    params.preset,
    params.customDate,
    params.startDate,
    params.endDate
  );

  // Parallel database execution for lowest response latency
  const refundConditions = [eq(orders.status, "REFUNDED")];
  if (startUtc && endUtc) {
    refundConditions.push(gte(orders.createdAt, startUtc));
    refundConditions.push(sql`${orders.createdAt} <= ${endUtc}`);
  }

  const deliveredConditions = [eq(orders.status, "DELIVERED")];
  if (startUtc && endUtc) {
    deliveredConditions.push(gte(orders.createdAt, startUtc));
    deliveredConditions.push(sql`${orders.createdAt} <= ${endUtc}`);
  }

  const [[fxRow], [refundResult], rows] = await Promise.all([
    db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "usdToMmkRate"))
      .limit(1),

    db
      .select({
        refundedCount: sql<number>`count(${orders.id})`,
        refundedAmountMmk: sql<number>`coalesce(sum(${orders.totalAmountMmk}), 0)`,
      })
      .from(orders)
      .where(and(...refundConditions)),

    db
      .select({
        orderId: orders.id,
        orderCreatedAt: orders.createdAt,
        orderTotalMmk: orders.totalAmountMmk,
        itemId: orderItems.id,
        productId: orderItems.productId,
        productNameSnapshot: orderItems.productNameSnapshot,
        quantity: orderItems.quantity,
        unitPriceMmk: orderItems.unitPriceMmk,
        unitCostUsd: orderItems.unitCostUsd,
        subtotalMmk: orderItems.subtotalMmk,
        categoryId: products.categoryId,
        categoryName: categories.name,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...deliveredConditions))
      .orderBy(asc(orders.createdAt)),
  ]);

  const exchangeRate = Number(fxRow?.value) || 4500;

  // 4. Aggregate summary metrics
  const distinctOrderIds = new Set<string>();
  let totalRevenueMmk = 0;
  let totalCostUsd = 0;
  let totalCostMmk = 0;

  // Structures for trend, categories, products
  const categoryMap = new Map<string, {
    categoryId: number | null;
    categoryName: string;
    revenueMmk: number;
    costMmk: number;
    profitMmk: number;
    orderCount: number;
  }>();

  const productMap = new Map<string, {
    productId: number;
    productName: string;
    categoryName: string;
    unitsSold: number;
    revenueMmk: number;
    costMmk: number;
    profitMmk: number;
    orderCount: number;
  }>();

  // Initialize trend buckets based on mode
  const trendBucketsMap = new Map<string, {
    label: string;
    date: string;
    revenueMmk: number;
    costMmk: number;
    profitMmk: number;
    orderIds: Set<string>;
  }>();

  if (mode === "HOURLY") {
    // 8 blocks of 3 hours
    const intervals = ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];
    for (const hStr of intervals) {
      trendBucketsMap.set(hStr, {
        label: hStr,
        date: hStr,
        revenueMmk: 0,
        costMmk: 0,
        profitMmk: 0,
        orderIds: new Set<string>(),
      });
    }
  } else if ((params.preset || "TODAY").toUpperCase() === "LAST_7_DAYS") {
    const nowMmMs = Date.now() + MM_OFFSET_MS;
    for (let i = 6; i >= 0; i--) {
      const dayMs = nowMmMs - i * 24 * 60 * 60 * 1000;
      const dayDate = new Date(dayMs);
      const y = dayDate.getUTCFullYear();
      const m = String(dayDate.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dayDate.getUTCDate()).padStart(2, "0");
      const key = `${y}-${m}-${d}`;
      trendBucketsMap.set(key, {
        label: formatDayLabel(key),
        date: key,
        revenueMmk: 0,
        costMmk: 0,
        profitMmk: 0,
        orderIds: new Set<string>(),
      });
    }
  }

  for (const row of rows) {
    distinctOrderIds.add(row.orderId);

    const qty = Number(row.quantity) || 1;
    const itemRevenue = Number(row.subtotalMmk) || (Number(row.unitPriceMmk) * qty);
    const itemCostUsd = (parseFloat(row.unitCostUsd) || 0) * qty;
    const itemCostMmk = Math.round(itemCostUsd * exchangeRate);
    const itemProfitMmk = itemRevenue - itemCostMmk;

    totalRevenueMmk += itemRevenue;
    totalCostUsd += itemCostUsd;
    totalCostMmk += itemCostMmk;

    // A. Trend bucketing
    if (mode === "HOURLY") {
      const h = getMyanmarHour(row.orderCreatedAt);
      const bucketHour = Math.floor(h / 3) * 3;
      const bucketKey = `${String(bucketHour).padStart(2, "0")}:00`;
      const bucket = trendBucketsMap.get(bucketKey);
      if (bucket) {
        bucket.revenueMmk += itemRevenue;
        bucket.costMmk += itemCostMmk;
        bucket.profitMmk += itemProfitMmk;
        bucket.orderIds.add(row.orderId);
      }
    } else {
      const dateKey = getMyanmarDateKey(row.orderCreatedAt);
      let bucket = trendBucketsMap.get(dateKey);
      if (!bucket) {
        bucket = {
          label: formatDayLabel(dateKey),
          date: dateKey,
          revenueMmk: 0,
          costMmk: 0,
          profitMmk: 0,
          orderIds: new Set<string>(),
        };
        trendBucketsMap.set(dateKey, bucket);
      }
      bucket.revenueMmk += itemRevenue;
      bucket.costMmk += itemCostMmk;
      bucket.profitMmk += itemProfitMmk;
      bucket.orderIds.add(row.orderId);
    }

    // Strip custom emojis like {pe:...} from category & product names
    const cleanCatName = stripCustomEmojiPlaceholders(row.categoryName || "").trim() || "Other Digital Products";
    const cleanProdName = stripCustomEmojiPlaceholders(row.productNameSnapshot || "").trim() || "Digital Item";

    // B. Category breakdown
    let cat = categoryMap.get(cleanCatName);
    if (!cat) {
      cat = {
        categoryId: row.categoryId || null,
        categoryName: cleanCatName,
        revenueMmk: 0,
        costMmk: 0,
        profitMmk: 0,
        orderCount: 0,
      };
      categoryMap.set(cleanCatName, cat);
    }
    cat.revenueMmk += itemRevenue;
    cat.costMmk += itemCostMmk;
    cat.profitMmk += itemProfitMmk;
    cat.orderCount += 1;

    // C. Product breakdown
    const prodKey = String(row.productId || cleanProdName);
    let prod = productMap.get(prodKey);
    if (!prod) {
      prod = {
        productId: row.productId,
        productName: cleanProdName,
        categoryName: cleanCatName,
        unitsSold: 0,
        revenueMmk: 0,
        costMmk: 0,
        profitMmk: 0,
        orderCount: 0,
      };
      productMap.set(prodKey, prod);
    }
    prod.unitsSold += qty;
    prod.revenueMmk += itemRevenue;
    prod.costMmk += itemCostMmk;
    prod.profitMmk += itemProfitMmk;
    prod.orderCount += 1;
  }

  const grossProfitMmk = totalRevenueMmk - totalCostMmk;
  const profitMarginPct = totalRevenueMmk > 0
    ? Number(((grossProfitMmk / totalRevenueMmk) * 100).toFixed(1))
    : 0;
  const deliveredOrdersCount = distinctOrderIds.size;
  const avgOrderValueMmk = deliveredOrdersCount > 0
    ? Math.round(totalRevenueMmk / deliveredOrdersCount)
    : 0;

  // Convert trend map to array
  const trend: AnalyticsTrendPoint[] = Array.from(trendBucketsMap.values()).map((b) => ({
    label: b.label,
    date: b.date,
    revenueMmk: b.revenueMmk,
    costMmk: b.costMmk,
    profitMmk: b.profitMmk,
    ordersCount: b.orderIds.size,
  }));

  // Convert categories map to sorted array with profitSharePct
  const categoriesList: AnalyticsCategory[] = Array.from(categoryMap.values())
    .map((c) => ({
      ...c,
      profitSharePct: grossProfitMmk > 0
        ? Number(((c.profitMmk / grossProfitMmk) * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => b.profitMmk - a.profitMmk);

  // Convert products map to sorted array with profitSharePct for Product Donut Chart
  const productsList: AnalyticsProductBreakdown[] = Array.from(productMap.values())
    .map((p: any) => ({
      productId: p.productId,
      productName: p.productName,
      categoryName: p.categoryName,
      unitsSold: p.unitsSold,
      revenueMmk: p.revenueMmk,
      costMmk: p.costMmk,
      profitMmk: p.profitMmk,
      profitSharePct: grossProfitMmk > 0
        ? Number(((p.profitMmk / grossProfitMmk) * 100).toFixed(1))
        : 0,
      orderCount: p.orderCount || 1,
    }))
    .sort((a, b) => b.profitMmk - a.profitMmk);

  // Convert top products map to sorted array with marginPct
  const topProducts: AnalyticsTopProduct[] = Array.from(productMap.values())
    .map((p) => ({
      productId: p.productId,
      productName: p.productName,
      categoryName: p.categoryName,
      unitsSold: p.unitsSold,
      revenueMmk: p.revenueMmk,
      costMmk: p.costMmk,
      profitMmk: p.profitMmk,
      marginPct: p.revenueMmk > 0
        ? Number(((p.profitMmk / p.revenueMmk) * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => b.profitMmk - a.profitMmk)
    .slice(0, 10);

  return {
    periodLabel,
    preset: (params.preset || "TODAY").toUpperCase(),
    summary: {
      totalRevenueMmk,
      totalCostMmk,
      totalCostUsd: Number(totalCostUsd.toFixed(2)),
      grossProfitMmk,
      profitMarginPct,
      deliveredOrdersCount,
      avgOrderValueMmk,
      refundedOrdersCount: Number(refundResult?.refundedCount || 0),
      refundedAmountMmk: Number(refundResult?.refundedAmountMmk || 0),
      exchangeRateUsed: exchangeRate,
    },
    trend,
    categories: categoriesList,
    products: productsList,
    topProducts,
  };
}
