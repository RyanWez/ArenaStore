/**
 * Telegram Bot API Error Handling Utilities
 */

/**
 * Checks whether an error is Telegram's benign "message is not modified" 400 error.
 * This occurs when an editMessage call attempts to replace a message with identical
 * text, caption, or inline keyboard markup.
 */
export function isMessageNotModified(err: unknown): boolean {
  if (!err) return false;
  const description =
    (err as any)?.description ||
    (err as any)?.message ||
    (err as any)?.response?.description ||
    (typeof err === "string" ? err : "");
  return (
    typeof description === "string" &&
    description.toLowerCase().includes("message is not modified")
  );
}
