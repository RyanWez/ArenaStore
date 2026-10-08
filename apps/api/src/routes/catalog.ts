import { FastifyInstance } from "fastify";
import { getDb, categories } from "@arena/db";
import { eq } from "drizzle-orm";
import { stripCustomEmojiPlaceholders } from "@arena/shared";
import { catalogService } from "../services/catalog.service";

export async function catalogRoutes(server: FastifyInstance) {
  // GET /api/catalog/categories
  server.get("/api/catalog/categories", async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=60");
    const db = getDb();
    const allCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(categories.sortOrder);

    return {
      ok: true,
      categories: allCategories.map((c) => ({
        ...c,
        cleanName: stripCustomEmojiPlaceholders(c.name),
      })),
    };
  });

  // GET /api/catalog/products
  server.get<{
    Querystring: { categoryId?: string };
  }>("/api/catalog/products", async (request, reply) => {
    reply.header("Cache-Control", "public, max-age=30, s-maxage=120, stale-while-revalidate=30");
    const categoryId = request.query.categoryId ? parseInt(request.query.categoryId, 10) : undefined;
    const products = await catalogService.getSellableProducts({ categoryId, activeOnly: true });

    return {
      ok: true,
      products,
      total: products.length,
    };
  });

  // GET /api/catalog/products/:id
  server.get<{
    Params: { id: string };
  }>("/api/catalog/products/:id", async (request, reply) => {
    const productId = parseInt(request.params.id, 10);
    if (isNaN(productId)) {
      return reply.status(400).send({ ok: false, error: "Invalid product id" });
    }

    const product = await catalogService.getSellableProduct(productId);
    if (!product) {
      return reply.status(404).send({ ok: false, error: "Product not found" });
    }

    reply.header("Cache-Control", "public, max-age=30, s-maxage=120, stale-while-revalidate=30");
    return {
      ok: true,
      product,
    };
  });
}
