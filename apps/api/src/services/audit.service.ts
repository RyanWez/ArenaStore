import { getDb, auditLogs } from "@arena/db";

export interface AuditEntry {
  actorId?: number | null;
  action: string;
  entityType: string;
  entityId: string | number;
  details?: unknown;
}

/**
 * Writes a standalone audit log row. Never throws — an audit failure must not
 * break the operation it records (rows written inside a caller's transaction,
 * like the customer deactivate/delete flows, keep using tx.insert directly).
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLogs).values({
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: String(entry.entityId),
      details: (entry.details ?? null) as any,
    });
  } catch (err: any) {
    console.error("[Audit] Failed to write audit log:", err.message);
  }
}
