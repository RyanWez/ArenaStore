import { FastifyInstance } from "fastify";
import { CreateOrderSchema, SubmitPaymentProofSchema } from "@arena/shared";
import { orderService } from "../services/order.service";

export async function orderRoutes(server: FastifyInstance) {
  // POST /api/orders (Create pending order from Telegram Bot — rate limit: 10 orders/min per telegramId/IP)
  server.post(
    "/api/orders",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 1000 * 60, // 10 orders per minute
          hook: "preValidation",
          keyGenerator: (req) => {
            // Always mix the real client IP into the bucket — trusting
            // body.telegramId alone lets a spammer mint a fresh bucket per
            // fake id (and pin stock reservations on arbitrary users).
            const tgId = (req.body as any)?.telegramId;
            return `order_${req.ip}_${tgId || "anon"}`;
          },
        },
      },
    },
    async (request, reply) => {
    const parseRes = CreateOrderSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.status(400).send({
        ok: false,
        error: "Validation error",
        issues: parseRes.error.issues,
      });
    }

    try {
      const order = await orderService.createPendingOrder(parseRes.data);
      return {
        ok: true,
        order,
      };
    } catch (err: any) {
      return reply.status(400).send({
        ok: false,
        error: err.message,
      });
    }
  });

  // POST /api/orders/:id/payments (Submit customer payment slip)
  server.post<{
    Params: { id: string };
  }>("/api/orders/:id/payments", async (request, reply) => {
    const payload = {
      ...(request.body as Record<string, unknown>),
      orderId: request.params.id,
    };

    const parseRes = SubmitPaymentProofSchema.safeParse(payload);
    if (!parseRes.success) {
      return reply.status(400).send({
        ok: false,
        error: "Validation error",
        issues: parseRes.error.issues,
      });
    }

    try {
      const submission = await orderService.submitPaymentProof(parseRes.data);
      return {
        ok: true,
        submission,
      };
    } catch (err: any) {
      return reply.status(400).send({
        ok: false,
        error: err.message,
      });
    }
  });
}
