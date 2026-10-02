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
            const tgId = (req.body as any)?.telegramId;
            return tgId ? `order_tg_${tgId}` : `order_ip_${req.ip}`;
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

  // GET /api/orders/:id (Check order details / status)
  server.get<{
    Params: { id: string };
  }>("/api/orders/:id", async (request, reply) => {
    const details = await orderService.getOrderDetails(request.params.id);
    if (!details) {
      return reply.status(404).send({ ok: false, error: "Order not found" });
    }

    return {
      ok: true,
      data: details,
    };
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

  // GET /api/users/:telegramId/profile (Customer Profile & Stats for Telegram Bot)
  server.get<{
    Params: { telegramId: string };
  }>("/api/users/:telegramId/profile", async (request) => {
    const profile = await orderService.getUserProfile(request.params.telegramId);
    return {
      ok: true,
      data: profile,
    };
  });
}
