import { Router } from "express";
import * as chat from "../controllers/chatController";
import { requireAuth, optionalAuth, requireRole } from "../middlewares/auth";
import {
  validate,
  sendMessageSchema,
  createConversationSchema,
} from "../middlewares/validation";

const chatRouter = Router();

// ─────────────────────────────────────────────
// Conversations
// ─────────────────────────────────────────────

// POST /api/chat/conversations
// optionalAuth — logged-in users get their convo saved,
// guests get an anonymous session
chatRouter.post(
  "/conversations",
  optionalAuth,
  validate(createConversationSchema),
  chat.createConversation,
);

// GET /api/chat/conversations
// Private — returns the user's paginated conversation list
chatRouter.get("/conversations", requireAuth, chat.getConversations);

// GET /api/chat/conversations/:id
// Private — full conversation with all messages
chatRouter.get("/conversations/:id", requireAuth, chat.getConversation);

// DELETE /api/chat/conversations/:id
// Private
chatRouter.delete("/conversations/:id", requireAuth, chat.deleteConversation);

// ─────────────────────────────────────────────
// Messages — SSE streaming endpoint
// ─────────────────────────────────────────────

// POST /api/chat/conversations/:id/messages
// optionalAuth — anonymous users can still send messages
// in their own anonymous conversation
chatRouter.post(
  "/conversations/:id/messages",
  optionalAuth,
  validate(sendMessageSchema),
  chat.sendMessage,
);

// ─────────────────────────────────────────────
// Safeguarding — facilitators only
// ─────────────────────────────────────────────

// GET /api/chat/flagged
chatRouter.get(
  "/flagged",
  requireAuth,
  requireRole("facilitator"),
  chat.getFlaggedConversations,
);

export default chatRouter;
