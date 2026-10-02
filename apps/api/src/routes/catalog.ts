import { FastifyInstance } from "fastify";
import { getDb, categories } from "@arena/db";
import { eq } from "drizzle-orm";
import { stripCustomEmojiPlaceholders } from "@arena/shared";
import { catalogService } from "../services/catalog.service";

export async function catalogRoutes(server: FastifyInstance) {
  // GET /api/catalog/categories
  server.get("/api/catalog/categories", async () => {
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
  }>("/api/catalog/products", async (request) => {
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
    const products = await catalogService.getSellableProducts({ activeOnly: true });
    const product = products.find((p) => p.id === productId);

    if (!product) {
      return reply.status(404).send({ ok: false, error: "Product not found" });
    }

    return {
      ok: true,
      product,
    };
  });
}
