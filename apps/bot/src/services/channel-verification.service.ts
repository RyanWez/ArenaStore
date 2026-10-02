import { Api } from "grammy";
import { botConfig, normalizeChannelUsername } from "../config";

export interface ChannelCheckResult {
  isMember: boolean;
  channelUsername: string;
  channelUrl: string;
  status?: string;
  error?: string;
}

export class ChannelVerificationService {
  /**
   * Checks if user is subscribed to the mandatory announcement channel.
   * Uses Telegram Bot API getChatMember(chat_id, user_id).
   */
  async checkMembership(
    api: Api,
    userId: number | string,
    overrideChannel?: string
  ): Promise<ChannelCheckResult> {
    const raw = overrideChannel || botConfig.REQUIRED_CHANNEL_USERNAME || "@arenasellerstore";
    const { username, url } = normalizeChannelUsername(raw);

    // If disabled in config, bypass
    if (!botConfig.FORCE_CHANNEL_JOIN) {
      return { isMember: true, channelUsername: username, channelUrl: url };
    }

    // In unit test environment without API mock, default to true
    if (!userId || (process.env.NODE_ENV === "test" && !api)) {
      return { isMember: true, channelUsername: username, channelUrl: url };
    }

    try {
      const numericUserId = typeof userId === "string" ? parseInt(userId, 10) : userId;
      if (isNaN(numericUserId)) {
        return { isMember: true, channelUsername: username, channelUrl: url };
      }

      const member = await api.getChatMember(username, numericUserId);
      const activeStatuses = ["creator", "administrator", "member", "restricted"];
      const isMember = activeStatuses.includes(member.status);

      return {
        isMember,
        channelUsername: username,
        channelUrl: url,
        status: member.status,
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`[ChannelVerification] Warning checking membership for user ${userId} in ${username}:`, msg);

      // If the bot is not an admin in the channel or chat is not found:
      if (
        msg.includes("chat not found") ||
        msg.includes("bot is not a member") ||
        msg.includes("CHAT_ADMIN_REQUIRED") ||
        msg.includes("Not Found") ||
        msg.includes("bot was kicked")
      ) {
        return {
          isMember: false,
          channelUsername: username,
          channelUrl: url,
          error: "BOT_NOT_ADMIN_OR_CHAT_NOT_FOUND",
        };
      }

      return {
        isMember: false,
        channelUsername: username,
        channelUrl: url,
        error: msg,
      };
    }
  }
}

export const channelVerificationService = new ChannelVerificationService();
