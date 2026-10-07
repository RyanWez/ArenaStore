import { FastifyInstance } from "fastify";
import { z } from "zod";
import { CreateBroadcastSchema } from "@arena/shared";
import { broadcastService } from "../services/broadcast.service";
import { requirePermission } from "../rbac/require-permission";

const TestBroadcastSchema = z.object({
  targetTelegramId: z.string().min(1, "Telegram ID is required"),
  message: z.string().min(1, "Message is required").max(4096),
  imageUrl: z.string().url().optional().or(z.literal("")),
  buttonText: z.string().max(128).optional().or(z.literal("")),
  buttonUrl: z.string().url().optional().or(z.literal("")),
});

export async function adminBroadcastRoutes(server: FastifyInstance) {
  // GET /api/admin/broadcasts — List broadcasts & audience overview
  server.get(
    "/api/admin/broadcasts",
    { preHandler: requirePermission("broadcast.view") },
    async (req, reply) => {
      const query = req.query as { limit?: string; page?: string };
      const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
      const page = Math.max(1, Number(query.page) || 1);
      const offset = (page - 1) * limit;

      const [data, audience] = await Promise.all([
        broadcastService.listBroadcasts(limit, offset),
        broadcastService.getAudienceStats(),
      ]);

      return reply.send({
        broadcasts: data.broadcasts,
        total: data.total,
        page,
        limit,
        audience,
      });
    }
  );

  // GET /api/admin/broadcasts/audience — Real-time audience statistics
  server.get(
    "/api/admin/broadcasts/audience",
    { preHandler: requirePermission("broadcast.view") },
    async (_req, reply) => {
      const stats = await broadcastService.getAudienceStats();
      return reply.send({ audience: stats });
    }
  );

  // POST /api/admin/broadcasts — Launch a mass broadcast
  server.post(
    "/api/admin/broadcasts",
    { preHandler: requirePermission("broadcast.send") },
    async (req, reply) => {
      const parsed = CreateBroadcastSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_FAILED",
          details: parsed.error.flatten(),
        });
      }

      const adminUser = (req as any).adminUser as { userId: number } | undefined;
      const actorId = adminUser?.userId || 1;

      const result = await broadcastService.createAndExecuteBroadcast(
        actorId,
        parsed.data
      );

      return reply.send({
        success: true,
        broadcastId: result.broadcastId,
        totalRecipients: result.totalRecipients,
      });
    }
  );

  // POST /api/admin/broadcasts/test — Send test message to a specific Telegram user
  server.post(
    "/api/admin/broadcasts/test",
    { preHandler: requirePermission("broadcast.send") },
    async (req, reply) => {
      const parsed = TestBroadcastSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_FAILED",
          details: parsed.error.flatten(),
        });
      }

      const result = await broadcastService.sendTestBroadcast({
        targetTelegramId: parsed.data.targetTelegramId,
        message: parsed.data.message,
        imageUrl: parsed.data.imageUrl || null,
        buttonText: parsed.data.buttonText || null,
        buttonUrl: parsed.data.buttonUrl || null,
      });

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error || "FAILED_TO_SEND",
        });
      }

      return reply.send({ success: true });
    }
  );

  // GET /api/admin/broadcasts/:id — Get details of a single broadcast
  server.get(
    "/api/admin/broadcasts/:id",
    { preHandler: requirePermission("broadcast.view") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const broadcast = await broadcastService.getBroadcastById(Number(id));
      if (!broadcast) {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
      return reply.send({ broadcast });
    }
  );
}
