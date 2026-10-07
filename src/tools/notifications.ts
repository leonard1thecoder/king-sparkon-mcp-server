/**
 * Notification inbox tools. The backend records per-user notifications on
 * withdrawal decisions, booking offers/cancellations and shift changes;
 * these tools read and acknowledge the caller's own rows. Listing includes
 * the unread count so agents can prioritize.
 */

import { z } from "zod";
import { backendGet, backendPost } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { auditTool, defineTool, type KingSparkonTool } from "./types.js";

const ALL_ROLES = ["USER", "ARTIST", "OWNER", "WORKER", "AFFILIATE", "ADMIN"] as const;

const getMyNotifications = defineTool({
  name: "get_my_notifications",
  description:
    "List my notifications, newest first, with the unread count (withdrawal decisions, booking offers, shift changes). Read-only; only my own rows are ever visible.",
  security: { classification: "READ", roles: [...ALL_ROLES], scopes: [], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {
    unreadOnly: z.boolean().optional(),
    page: z.number().int().min(0).optional(),
    size: z.number().int().min(1).max(100).optional(),
  },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { unreadOnly?: boolean; page?: number; size?: number };
    const [notifications, unread] = await Promise.all([
      backendGet(ctx, API.notificationsMe, {
        unreadOnly: args.unreadOnly ?? false,
        page: args.page ?? 0,
        size: args.size ?? 20,
      }),
      backendGet<{ unread?: number }>(ctx, API.notificationsUnreadCount).catch(() => ({ unread: 0 })),
    ]);
    auditTool(ctx, getMyNotifications, "ok");
    return { notifications, unreadCount: unread.unread ?? 0 };
  },
});

const markNotificationRead = defineTool({
  name: "mark_notification_read",
  description: "Acknowledge one of my notifications. Only the recipient's own rows can be acknowledged.",
  security: { classification: "WRITE", roles: [...ALL_ROLES], scopes: [], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { notificationId: z.number().int().positive() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { notificationId: number };
    const result = await backendPost(ctx, API.notificationRead(args.notificationId));
    auditTool(ctx, markNotificationRead, "ok", { resourceType: "notification", resourceId: String(args.notificationId) });
    return result;
  },
});

const markAllNotificationsRead = defineTool({
  name: "mark_all_notifications_read",
  description: "Acknowledge all my unread notifications at once.",
  security: { classification: "WRITE", roles: [...ALL_ROLES], scopes: [], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const result = await backendPost(ctx, API.notificationsReadAll);
    auditTool(ctx, markAllNotificationsRead, "ok");
    return result;
  },
});

export const notificationTools: KingSparkonTool[] = [
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
];
