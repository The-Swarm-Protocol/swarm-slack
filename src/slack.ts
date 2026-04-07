/**
 * Slack App Integration
 *
 * Connect Slack channels to Swarm channels.
 * Uses Slack Web API + Events API for message bridging.
 *
 * Setup:
 * 1. Create Slack app at https://api.slack.com/apps
 * 2. Enable Events API and subscribe to message.channels, message.groups
 * 3. Add OAuth scopes: chat:write, channels:read, channels:history, users:read
 * 4. Install app to workspace and get OAuth token
 * 5. Set Request URL to /api/webhooks/slack
 */

import crypto from "crypto";

// ═══════════════════════════════════════════════════════════════
// Types (Slack API)
// ═══════════════════════════════════════════════════════════════

export interface SlackMessage {
  type: string;
  subtype?: string;
  ts: string;
  user?: string;
  bot_id?: string;
  text: string;
  channel: string;
  thread_ts?: string;
  attachments?: SlackAttachment[];
  files?: SlackFile[];
  blocks?: SlackBlock[];
}

export interface SlackAttachment {
  id?: number;
  fallback?: string;
  color?: string;
  pretext?: string;
  author_name?: string;
  author_link?: string;
  author_icon?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  image_url?: string;
  thumb_url?: string;
  footer?: string;
  footer_icon?: string;
  ts?: number;
}

export interface SlackFile {
  id: string;
  created: number;
  timestamp: number;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  pretty_type: string;
  user: string;
  size: number;
  url_private: string;
  url_private_download: string;
  thumb_64?: string;
  thumb_80?: string;
  thumb_360?: string;
  thumb_480?: string;
  thumb_720?: string;
  permalink: string;
  permalink_public?: string;
}

export interface SlackBlock {
  type: string;
  block_id?: string;
  text?: {
    type: string;
    text: string;
  };
  elements?: unknown[];
  accessory?: unknown;
}

export interface SlackUser {
  id: string;
  team_id: string;
  name: string;
  deleted: boolean;
  profile: {
    real_name: string;
    display_name: string;
    email?: string;
    image_24?: string;
    image_32?: string;
    image_48?: string;
    image_72?: string;
    image_192?: string;
  };
  is_bot: boolean;
  is_app_user: boolean;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_mpim: boolean;
  is_private: boolean;
  created: number;
  is_archived: boolean;
  is_general: boolean;
  topic?: {
    value: string;
    creator: string;
    last_set: number;
  };
  purpose?: {
    value: string;
    creator: string;
    last_set: number;
  };
  num_members?: number;
}

export interface SlackEvent {
  type: string;
  event_ts: string;
  team_id?: string;
  api_app_id?: string;
  event: {
    type: string;
    channel?: string;
    user?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    channel_type?: string;
    [key: string]: unknown;
  };
}

// ═══════════════════════════════════════════════════════════════
// Slack Web API Client
// ═══════════════════════════════════════════════════════════════

export class SlackClient {
  private token: string;
  private apiBase = "https://slack.com/api";

  constructor(token: string) {
    this.token = token;
  }

  private async request(
    endpoint: string,
    params?: Record<string, unknown>
  ): Promise<any> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    const body = params ? JSON.stringify(params) : undefined;

    const res = await fetch(`${this.apiBase}/${endpoint}`, {
      method: "POST",
      headers,
      body,
    });

    const data = await res.json();

    if (!data.ok) {
      console.error(`Slack API error (${endpoint}):`, data.error);
      return null;
    }

    return data;
  }

  // ─── Send Message ───────────────────────────────────────────────

  async postMessage(
    channel: string,
    text: string,
    options?: {
      thread_ts?: string;
      blocks?: SlackBlock[];
      attachments?: SlackAttachment[];
      as_user?: boolean;
    }
  ): Promise<{ ok: boolean; ts?: string; channel?: string } | null> {
    const params: Record<string, unknown> = {
      channel,
      text,
    };

    if (options?.thread_ts) {
      params.thread_ts = options.thread_ts;
    }
    if (options?.blocks) {
      params.blocks = options.blocks;
    }
    if (options?.attachments) {
      params.attachments = options.attachments;
    }
    if (options?.as_user !== undefined) {
      params.as_user = options.as_user;
    }

    return this.request("chat.postMessage", params);
  }

  // ─── Update Message ─────────────────────────────────────────────

  async updateMessage(
    channel: string,
    ts: string,
    text: string,
    blocks?: SlackBlock[]
  ): Promise<{ ok: boolean } | null> {
    const params: Record<string, unknown> = {
      channel,
      ts,
      text,
    };

    if (blocks) {
      params.blocks = blocks;
    }

    return this.request("chat.update", params);
  }

  // ─── Delete Message ─────────────────────────────────────────────

  async deleteMessage(channel: string, ts: string): Promise<{ ok: boolean } | null> {
    return this.request("chat.delete", { channel, ts });
  }

  // ─── Add Reaction ───────────────────────────────────────────────

  async addReaction(
    channel: string,
    timestamp: string,
    name: string
  ): Promise<{ ok: boolean } | null> {
    return this.request("reactions.add", {
      channel,
      timestamp,
      name, // e.g., "thumbsup", "heart", "rocket"
    });
  }

  // ─── Get User Info ──────────────────────────────────────────────

  async getUserInfo(userId: string): Promise<SlackUser | null> {
    const data = await this.request("users.info", { user: userId });
    return data?.user || null;
  }

  // ─── Get Channel Info ───────────────────────────────────────────

  async getChannelInfo(channelId: string): Promise<SlackChannel | null> {
    const data = await this.request("conversations.info", { channel: channelId });
    return data?.channel || null;
  }

  // ─── List Channels ──────────────────────────────────────────────

  async listChannels(
    excludeArchived = true,
    types = "public_channel,private_channel"
  ): Promise<SlackChannel[] | null> {
    const data = await this.request("conversations.list", {
      exclude_archived: excludeArchived,
      types,
    });
    return data?.channels || null;
  }

  // ─── Get Bot Info ───────────────────────────────────────────────

  async authTest(): Promise<{
    ok: boolean;
    url?: string;
    team?: string;
    user?: string;
    team_id?: string;
    user_id?: string;
    bot_id?: string;
  } | null> {
    return this.request("auth.test");
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

export function extractMessageContent(message: SlackMessage): {
  text: string;
  attachments: Array<{ url: string; type: string; name: string }>;
} {
  const text = message.text || "";
  const attachments: Array<{ url: string; type: string; name: string }> = [];

  // Files
  if (message.files) {
    for (const file of message.files) {
      attachments.push({
        url: file.url_private,
        type: file.mimetype,
        name: file.name,
      });
    }
  }

  return { text, attachments };
}

export async function getSenderName(
  client: SlackClient,
  userId?: string
): Promise<string> {
  if (!userId) return "Unknown";

  try {
    const user = await client.getUserInfo(userId);
    if (!user) return userId;

    return (
      user.profile.display_name ||
      user.profile.real_name ||
      user.name ||
      userId
    );
  } catch {
    return userId;
  }
}

export function verifySlackRequest(
  signingSecret: string,
  requestSignature: string,
  timestamp: string,
  body: string
): boolean {
  // Verify timestamp is recent (within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 60 * 5) {
    return false;
  }

  // Compute signature
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(sigBasestring);
  const computedSignature = `v0=${hmac.digest("hex")}`;

  // Compare signatures
  return crypto.timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(requestSignature)
  );
}

export function createSlackBlock(
  type: "section" | "header" | "divider",
  text?: string
): SlackBlock {
  if (type === "divider") {
    return { type: "divider" };
  }

  if (type === "header") {
    return {
      type: "header",
      text: {
        type: "plain_text",
        text: text || "",
      },
    };
  }

  // section
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: text || "",
    },
  };
}
