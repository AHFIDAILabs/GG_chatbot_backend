import { Request } from "express";
import mongoose from "mongoose";
import { UserRole, AgeGroupUser } from "../models/User";
import { Language, Intent } from "../models/Conversation";

// ─────────────────────────────────────────────
// JWT Payload
// ─────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  role: UserRole;
  ageGroup: AgeGroupUser;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

// ─────────────────────────────────────────────
// Express — authenticated request
// Attach this after requireAuth middleware runs
// ─────────────────────────────────────────────

export interface AuthRequest extends Request {
  user: {
    userId: string;
    role: UserRole;
    ageGroup: AgeGroupUser;
  };
}

// ─────────────────────────────────────────────
// Auth controller bodies
// ─────────────────────────────────────────────

export interface RegisterBody {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  ageGroup?: AgeGroupUser;
  consentGiven?: boolean;
}

export interface LoginBody {
  email: string;
  password: string;
}

// ─────────────────────────────────────────────
// Chat controller bodies
// ─────────────────────────────────────────────

export interface CreateConversationBody {
  ageGroup?: AgeGroupUser;
  isAnonymous?: boolean;
  language?: Language;
}

export interface SendMessageBody {
  question: string;
}

// ─────────────────────────────────────────────
// RAG service types
// ─────────────────────────────────────────────

export interface RetrievedChunk {
  text: string;
  source: string;
  pillar: string;
  sessionTitle: string;
  score: number; // cosine similarity
}

export interface RagResult {
  answer: string;
  intent: Intent;
  retrievedChunks: RetrievedChunk[];
  pillarSource: string | null;
  tokensUsed: number;
  latencyMs: number;
}

// ─────────────────────────────────────────────
// Standard API response wrapper
// ─────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
  code?: string; // machine-readable e.g. "INVALID_TOKEN", "NOT_FOUND"
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ─────────────────────────────────────────────
// Pagination (used in history endpoint)
// ─────────────────────────────────────────────

export interface PaginationQuery {
  page?: string;
  limit?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

// ─────────────────────────────────────────────
// Socket.io events
// ─────────────────────────────────────────────

export interface SafeguardingAlertPayload {
  conversationId: string;
  userId: string | null;
  flagReason: string;
  messageSnippet: string;
  timestamp: string;
}

export interface DMMessagePayload {
  threadId:       string;
  message:        { sender: 'girl' | 'facilitator'; content: string; timestamp: string; readAt: string | null };
  girlId?:        string;
  girlName?:      string;
  facilitatorId?: string;
}

export interface DMReadPayload {
  by:      'girl' | 'facilitator';
  girlId?: string;
}

export interface ServerToClientEvents {
  "safeguarding:alert": (payload: SafeguardingAlertPayload) => void;
  "chat:token":         (token: string) => void;
  "chat:done":          () => void;
  "chat:error":         (message: string) => void;
  "dm:message":         (payload: DMMessagePayload) => void;
  "dm:read":            (payload: DMReadPayload) => void;
  "dm:typing":          (payload: { senderName: string }) => void;
  "dm:typing:stop":     () => void;
}

export interface ClientToServerEvents {
  "room:join":      (room: string) => void;
  "dm:join":        (userId: string) => void;
  "dm:typing":      (data: { recipientId: string; senderName: string }) => void;
  "dm:typing:stop": (data: { recipientId: string }) => void;
}
