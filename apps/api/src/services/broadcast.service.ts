import { getDb, broadcasts, users, wallets, type Broadcast } from "@arena/db";
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { sendTelegramBroadcastItem } from "./telegram-notifier";
import { writeAudit } from "./audit.service";
import type { CreateBroadcastInput } from "@arena/shared";

const BROADCAST_DELAY_MS = 50; // ~20 messages/second, safely under Telegram's 30/s limit

export interface AudienceStats {
  allUsers: number;
  customers: number;
  withBalance: number;
}

export class BroadcastService {
  private activeBroadcastId: number | null = null;

  async getAudienceStats(): Promise<AudienceStats> {
    const db = getDb();

    // 1. All active bot users with telegramId
    const [allResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(isNotNull(users.telegramId), eq(users.status, "ACTIVE")));

    // 2. Customers only
    const [customersResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(isNotNull(users.telegramId), eq(users.status, "ACTIVE"), eq(users.role, "CUSTOMER")));

    // 3. Users with balance > 0
    const [balanceResult] = await db
      .select({ count: sql<number>`count(distinct ${users.id})` })
      .from(users)
      .innerJoin(wallets, eq(wallets.userId, users.id))
      .where(
        and(
          isNotNull(users.telegramId),
          eq(users.status, "ACTIVE"),
          gt(wallets.balanceMmk, 0)
        )
      );

    return {
      allUsers: Number(allResult?.count || 0),
      customers: Number(customersResult?.count || 0),
      withBalance: Number(balanceResult?.count || 0),
    };
  }

  async getRecipientTelegramIds(targetAudience: string): Promise<string[]> {
    const db = getDb();

    if (targetAudience === "WITH_BALANCE") {
      const rows = await db
        .select({ telegramId: users.telegramId })
        .from(users)
        .innerJoin(wallets, eq(wallets.userId, users.id))
        .where(
          and(
            isNotNull(users.telegramId),
            eq(users.status, "ACTIVE"),
            gt(wallets.balanceMmk, 0)
          )
        );
      return rows.map((r) => r.telegramId!).filter(Boolean);
    }

    if (targetAudience === "CUSTOMERS") {
      const rows = await db
        .select({ telegramId: users.telegramId })
        .from(users)
        .where(
          and(
            isNotNull(users.telegramId),
            eq(users.status, "ACTIVE"),
            eq(users.role, "CUSTOMER")
          )
        );
      return rows.map((r) => r.telegramId!).filter(Boolean);
    }

    // Default: ALL
    const rows = await db
      .select({ telegramId: users.telegramId })
      .from(users)
      .where(and(isNotNull(users.telegramId), eq(users.status, "ACTIVE")));
    return rows.map((r) => r.telegramId!).filter(Boolean);
  }

  async listBroadcasts(limit = 20, offset = 0) {
    const db = getDb();

    const [countResult] = await db
      .select({ total: sql<number>`count(*)` })
      .from(broadcasts);

    const rows = await db
      .select({
        id: broadcasts.id,
        actorId: broadcasts.actorId,
        actorName: users.firstName,
        actorUsername: users.username,
        title: broadcasts.title,
        message: broadcasts.message,
        imageUrl: broadcasts.imageUrl,
        buttonText: broadcasts.buttonText,
        buttonUrl: broadcasts.buttonUrl,
        targetAudience: broadcasts.targetAudience,
        totalRecipients: broadcasts.totalRecipients,
        sentCount: broadcasts.sentCount,
        failedCount: broadcasts.failedCount,
        blockedCount: broadcasts.blockedCount,
        status: broadcasts.status,
        startedAt: broadcasts.startedAt,
        completedAt: broadcasts.completedAt,
        createdAt: broadcasts.createdAt,
      })
      .from(broadcasts)
      .leftJoin(users, eq(broadcasts.actorId, users.id))
      .orderBy(desc(broadcasts.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      broadcasts: rows,
      total: Number(countResult?.total || 0),
    };
  }

  async getBroadcastById(id: number) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(broadcasts)
      .where(eq(broadcasts.id, id))
      .limit(1);
    return row || null;
  }

  async sendTestBroadcast(options: {
    targetTelegramId: string;
    message: string;
    imageUrl?: string | null;
    buttonText?: string | null;
    buttonUrl?: string | null;
  }) {
    return sendTelegramBroadcastItem({
      chatId: options.targetTelegramId,
      text: options.message,
      imageUrl: options.imageUrl,
      buttonText: options.buttonText,
      buttonUrl: options.buttonUrl,
    });
  }

  async createAndExecuteBroadcast(
    actorId: number,
    input: CreateBroadcastInput
  ): Promise<{ broadcastId: number; totalRecipients: number }> {
    const db = getDb();
    const recipients = await this.getRecipientTelegramIds(input.targetAudience);

    const [inserted] = await db
      .insert(broadcasts)
      .values({
        actorId,
        title: input.title || null,
        message: input.message,
        imageUrl: input.imageUrl?.trim() || null,
        buttonText: input.buttonText?.trim() || null,
        buttonUrl: input.buttonUrl?.trim() || null,
        targetAudience: input.targetAudience,
        totalRecipients: recipients.length,
        status: recipients.length > 0 ? "SENDING" : "COMPLETED",
        startedAt: new Date(),
        completedAt: recipients.length === 0 ? new Date() : null,
      })
      .returning({ id: broadcasts.id });

    const broadcastId = inserted.id;

    void writeAudit({
      actorId,
      action: "SEND_BROADCAST",
      entityType: "BROADCAST",
      entityId: String(broadcastId),
      details: {
        title: input.title,
        targetAudience: input.targetAudience,
        totalRecipients: recipients.length,
        hasImage: Boolean(input.imageUrl),
        hasButton: Boolean(input.buttonText),
      },
    });

    if (recipients.length > 0) {
      // Execute asynchronously in background
      void this.executeBroadcastFanOut(broadcastId, recipients, input);
    }

    return {
      broadcastId,
      totalRecipients: recipients.length,
    };
  }

  private async executeBroadcastFanOut(
    broadcastId: number,
    recipients: string[],
    input: CreateBroadcastInput
  ): Promise<void> {
    const db = getDb();
    this.activeBroadcastId = broadcastId;

    let sentCount = 0;
    let failedCount = 0;
    let blockedCount = 0;

    console.log(
      `[BroadcastService] Starting broadcast #${broadcastId} to ${recipients.length} recipients...`
    );

    try {
      for (const telegramId of recipients) {
        const result = await sendTelegramBroadcastItem({
          chatId: telegramId,
          text: input.message,
          imageUrl: input.imageUrl,
          buttonText: input.buttonText,
          buttonUrl: input.buttonUrl,
        });

        if (result.success) {
          sentCount++;
        } else if (result.blocked) {
          blockedCount++;
        } else {
          failedCount++;
        }

        // Pacing delay
        await new Promise((resolve) => setTimeout(resolve, BROADCAST_DELAY_MS));
      }

      await db
        .update(broadcasts)
        .set({
          sentCount,
          failedCount,
          blockedCount,
          status: "COMPLETED",
          completedAt: new Date(),
        })
        .where(eq(broadcasts.id, broadcastId));

      console.log(
        `[BroadcastService] Finished broadcast #${broadcastId}: ${sentCount} sent, ${blockedCount} blocked, ${failedCount} failed.`
      );
    } catch (err: any) {
      console.error(`[BroadcastService] Error in broadcast #${broadcastId}:`, err.message);
      await db
        .update(broadcasts)
        .set({
          sentCount,
          failedCount,
          blockedCount,
          status: "FAILED",
          completedAt: new Date(),
        })
        .where(eq(broadcasts.id, broadcastId))
        .catch(() => {});
    } finally {
      if (this.activeBroadcastId === broadcastId) {
        this.activeBroadcastId = null;
      }
    }
  }
}

export const broadcastService = new BroadcastService();
