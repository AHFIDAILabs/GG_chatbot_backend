import { Request, Response, NextFunction } from "express";
import Groq from "groq-sdk";
import { PipelineStage } from "mongoose";
import Conversation from "../models/Conversation";
import { getIO } from "../config/socket";
import Chunk from "../models/Chunks";
import { AuthRequest, RetrievedChunk } from "../types";
import { Errors, asyncHandler } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { embedText, cosineSimilarity } from "../utils/embeddings";
import {
  detectLanguage,
  classifyIntent,
  isSafeguardingConcern,
  extractFlagReason,
} from "../utils/languageDetector";

// ─────────────────────────────────────────────
// Groq client
// ─────────────────────────────────────────────

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

// ─────────────────────────────────────────────
// Safeguarding system prompt
// Injected when a concern is detected —
// overrides the normal curriculum prompt
// ─────────────────────────────────────────────

const SAFEGUARDING_PROMPT = `You are Amara, a caring and trusted companion for girls at the GGCL Green Girls Academy.
The girl you are speaking with may be experiencing something very difficult or unsafe.
Respond with warmth, calm and deep care. Do NOT ask probing questions.
Validate her feelings, remind her she is not alone, and clearly direct her to:
- Her GGCL facilitator
- Nigeria Emergency Services: 112
- Child Helpline Nigeria: 0800-24453-0
Keep your response brief, warm and focused on her safety. End with: "You are brave for reaching out. 💚"`;

// ─────────────────────────────────────────────
// Curriculum system prompt builder
// Adapts tone based on age group
// ─────────────────────────────────────────────

function buildSystemPrompt(ageGroup: string | null, language: string): string {
  const tone =
    ageGroup === "10-13"
      ? "Use very simple, friendly language. Short sentences. Avoid complex medical terms — if you use one, explain it immediately in simple words."
      : "You can use clear, direct language. You may use accurate medical or scientific terms with brief explanations.";

  const langNote =
    language !== "en"
      ? `The girl prefers ${language}. Respond ENTIRELY in ${language} — do not mix with English or other languages.`
      : "The girl is writing in English. Respond ENTIRELY in English.";

  return `You are Amara, a warm, knowledgeable and trusted learning companion for the GGCL Green Girls Academy — an NGO supporting adolescent girls aged 10–18 in Nigeria.

You are trained on the full GGCL four-pillar curriculum:
- Pillar 1: Period & Menstrual Hygiene (cycles, cramps, hygiene, puberty, myths, emotional wellbeing)
- Pillar 2: Environmental Sustainability (climate change, recycling, waste management, eco-living)
- Pillar 3: Digital & AI Skills (internet safety, computers, AI literacy, digital citizenship)
- Pillar 4: Life Skills & Financial Literacy (confidence, communication, leadership, saving, budgeting, entrepreneurship)

${tone}
${langNote}

You will be given relevant excerpts from the GGCL training manual. Use them as your primary source. If the excerpts do not fully answer the question, supplement with your own accurate knowledge — but stay within the four curriculum pillars.

**Greetings & Off-Topic Questions:**
- If the question is a greeting (e.g., "How are you?", "Hello", "Hi"), respond with a SHORT greeting (1–2 sentences max) and then ask what they'd like to explore.
- Example: "Hello! I'm doing well, thanks for asking! 😊 What would you like to explore?"
- If a question is completely unrelated to the four pillars, gently acknowledge it and redirect: "That's a bit outside what I cover, but I'm here to help with periods, the environment, digital skills and life skills. What would you like to explore?"

Rules:
- Never be dismissive, judgmental or condescending
- Validate emotions before giving information
- End every response with encouragement — girls should leave feeling capable and supported
- Keep responses focused: 150–250 words unless the topic genuinely needs more depth
- Use **bold** for key terms and bullet points for lists
- NEVER mix languages — respond entirely in the language the girl used`;

}

// ─────────────────────────────────────────────
// RAG: Retrieve relevant chunks
// ─────────────────────────────────────────────

async function retrieveChunks(
  question: string,
  intent: string,
  ageGroup: string | null,
  topK: number = 4,
): Promise<RetrievedChunk[]> {
  // Step 1: Build Atlas filter — always filter by pillar when intent is known
  const pillarMap: Record<string, string> = {
    menstrual_hygiene: "menstrual_hygiene",
    environment: "environment",
    digital_skills: "digital_skills",
    life_skills: "life_skills",
  };

  const filter: Record<string, unknown> = {};
  if (pillarMap[intent]) filter.pillar = pillarMap[intent];
  if (ageGroup) filter.ageGroup = { $in: [ageGroup, "both"] };

  // Step 2: Try vector search first
  const queryEmbedding = await embedText(question);

  if (queryEmbedding.length > 0) {
    // Atlas Vector Search index requires $vectorSearch (not $search/knnBeta).
    // numCandidates controls the HNSW search breadth; limit caps pre-filter results.
    // Filter fields (pillar, ageGroup) applied via $match after $vectorSearch because
    // the index was created without explicit filter-field definitions.
    const pipeline = [
      {
        $vectorSearch: {
          index: "chunk_vector_index",
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: topK * 10,
          limit: topK * 4,
        },
      },
      ...(Object.keys(filter).length > 0 ? [{ $match: filter }] : []),
      { $limit: topK },
      {
        $project: {
          text: 1,
          source: 1,
          pillar: 1,
          sessionTitle: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ] as unknown as PipelineStage[];

    try {
      const results = await Chunk.aggregate(pipeline);

      if (results.length > 0) {
        // Re-rank with exact cosine similarity for precision
        // Filter out low-confidence matches (score < 0.65) to avoid irrelevant context
        const filtered = results
          .map((r: any) => ({
            text: r.text,
            source: r.source,
            pillar: r.pillar,
            sessionTitle: r.sessionTitle,
            score: r.score ?? 0,
          }))
          .filter((r: any) => r.score >= 0.65)
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);

        return filtered.length > 0 ? filtered : [];
      }
    } catch (err) {
      console.warn(
        "[RAG] Atlas vector search failed, falling back to keyword search:",
        err,
      );
    }
  }

  // Step 3: Keyword fallback — when HF key is missing or Atlas search fails
  const keywords = question
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const regexes = keywords.map((k) => new RegExp(k, "i"));
  const query: Record<string, unknown> = {
    $or: regexes.map((r) => ({ text: r })),
  };
  if (filter.pillar) query.pillar = filter.pillar;
  if (filter.ageGroup) query.ageGroup = filter.ageGroup;

  const keywordResults = await Chunk.find(query).limit(topK).lean();

  return keywordResults.map((r: any) => ({
    text: r.text,
    source: r.source,
    pillar: r.pillar,
    sessionTitle: r.sessionTitle,
    score: 0,
  }));
}

// ─────────────────────────────────────────────
// POST /api/chat/conversations
// Create a new conversation session
// Optional auth — anonymous sessions allowed
// ─────────────────────────────────────────────

export const createConversation = asyncHandler(
  async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    const { ageGroup, isAnonymous, language } = req.body;

    const conversation = await Conversation.create({
      userId: user?.userId ?? null,
      ageGroup: ageGroup ?? user?.ageGroup ?? null,
      isAnonymous: isAnonymous ?? !user,
      language: language ?? "en",
      messages: [],
    });

    sendSuccess(res, { conversation }, 201);
  },
);

// ─────────────────────────────────────────────
// POST /api/chat/conversations/:id/messages
// Send a message — streams response via SSE
// Optional auth — anonymous sessions allowed
// ─────────────────────────────────────────────

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { question } = req.body;
  const user = (req as AuthRequest).user;
  const startTime = Date.now();

  // ── Fetch conversation ────────────────────
  const conversation = await Conversation.findById(id);
  if (!conversation) throw Errors.notFound("Conversation not found");

  // ── Ownership check ───────────────────────
  // Authenticated users can only access their own conversations
  if (user && conversation.userId) {
    if (conversation.userId.toString() !== user.userId) {
      throw Errors.forbidden("You do not have access to this conversation");
    }
  }

  // ── Safeguarding check ────────────────────
  const safeguarding = isSafeguardingConcern(question);
  if (safeguarding) {
    const flagReason = extractFlagReason(question);
    conversation.flagged = true;
    conversation.flagReason = flagReason;

    // Emit real-time alert to facilitators via Socket.io
    try {
      getIO()
        .to("room:facilitators")
        .emit("safeguarding:alert", {
          conversationId: conversation._id.toString(),
          userId: conversation.userId?.toString() ?? null,
          flagReason: flagReason ?? "Unknown",
          messageSnippet: question.slice(0, 100),
          timestamp: new Date().toISOString(),
        });
    } catch {
      // Socket may not be initialised in test environments — non-critical
    }
  }

  // ── Detect language and classify intent ───
  const language = detectLanguage(question);
  const intent = classifyIntent(question);

  console.log(`[CHAT] Question: "${question.slice(0, 50)}" | Intent: ${intent} | Language: ${language}`);

  // Always update conversation language to reflect the current message's language
  conversation.language = language;

  // ── Add user message to history ───────────
  conversation.messages.push({
    role: "user",
    content: question,
    intent,
    retrievedChunks: [],
    pillarSource: null,
    tokensUsed: 0,
    latencyMs: 0,
    timestamp: new Date(),
  });

  // ── SSE headers ───────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let systemPrompt: string;
    let retrievedChunks: RetrievedChunk[] = [];
    let pillarSource: string | null = null;
    let contextBlock = "";

    if (safeguarding) {
      // ── Safeguarding path ─────────────────
      systemPrompt = SAFEGUARDING_PROMPT;
      console.log(`[CHAT] Safeguarding triggered`);
    } else if (intent === 'greeting' || intent === 'off_topic') {
      // ── Greeting / off-topic path (no RAG) ─
      console.log(`[CHAT] Intent: ${intent} — skipping RAG`);
      // Skip retrieval for greetings and off-topic — respond warmly without curriculum context
      systemPrompt = buildSystemPrompt(
        conversation.ageGroup ?? user?.ageGroup ?? null,
        language,
      );
      contextBlock = "";
    } else {
      // ── Normal RAG path ───────────────────
      console.log(`[CHAT] Pillar intent: ${intent} — retrieving RAG context`);
      const ageGroup = conversation.ageGroup ?? user?.ageGroup ?? null;
      retrievedChunks = await retrieveChunks(question, intent, ageGroup);

      if (retrievedChunks.length > 0) {
        contextBlock = retrievedChunks
          .map((c, i) => `[${i + 1}] ${c.text}`)
          .join("\n\n");

        pillarSource = retrievedChunks[0].sessionTitle ?? null;
        console.log(`[CHAT] Retrieved ${retrievedChunks.length} chunks from pillar: ${pillarSource}`);
      } else if (question.trim().split(' ').length < 4) {
        // No pillar match + very short query → likely off-topic
        console.log(`[CHAT] No chunks found for short query — treating as off-topic`);
        contextBlock = "";
      }

      systemPrompt = buildSystemPrompt(
        conversation.ageGroup ?? user?.ageGroup ?? null,
        language,
      );
    }

    // ── Build message history for Groq ───────
    // Include last 6 turns for context continuity
    const historyMessages = conversation.messages
      .slice(-6)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Pop the last user message — we add it below with context
    historyMessages.pop();

    const userMessageWithContext = contextBlock
      ? `Context from GGCL curriculum:\n${contextBlock}\n\nGirl's question: ${question}`
      : question;

    // ── Stream from Groq (with rate-limit retry) ──────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stream!: any;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        stream = await groq.chat.completions.create({
          model: GROQ_MODEL,
          max_tokens: 500,
          temperature: 0.6,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            ...historyMessages,
            { role: "user", content: userMessageWithContext },
          ],
        });
        lastErr = undefined;
        break;
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 429 && attempt < 2) {
          const retryAfter = parseInt(err?.headers?.["retry-after"] ?? "10", 10);
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
        } else {
          throw err;
        }
      }
    }
    if (lastErr) throw lastErr;

    let fullAnswer = "";
    let tokensUsed = 0;

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? "";
      if (token) {
        fullAnswer += token;
        send("token", { token });
      }
    }

    // finalUsage() is available after the stream has fully consumed
    // It returns the token counts from the last chunk that carries usage data
    try {
      const usage = await (stream as any).finalUsage?.();
      if (usage?.total_tokens) tokensUsed = usage.total_tokens;
    } catch {
      // finalUsage not available on all groq-sdk versions — not critical
      tokensUsed = 0;
    }

    const latencyMs = Date.now() - startTime;

    // ── Save assistant message ─────────────
    conversation.messages.push({
      role: "assistant",
      content: fullAnswer,
      intent,
      retrievedChunks: retrievedChunks.map((c) => c.text),
      pillarSource,
      tokensUsed,
      latencyMs,
      timestamp: new Date(),
    });

    await conversation.save();

    // ── Done event ─────────────────────────
    send("done", {
      conversationId: conversation._id,
      latencyMs,
      tokensUsed,
      pillarSource,
      intent,
    });
  } catch (err: any) {
    console.error("[chat] Groq streaming error:", err);
    send("error", {
      message:
        "Amara is having trouble responding right now. Please try again.",
    });
  } finally {
    res.end();
  }
});

// ─────────────────────────────────────────────
// GET /api/chat/conversations
// Private — returns paginated conversation list
// ─────────────────────────────────────────────

export const getConversations = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId } = (req as AuthRequest).user;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      Conversation.find({ userId })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("messages language ageGroup flagged updatedAt createdAt")
        .lean(),
      Conversation.countDocuments({ userId }),
    ]);

    // Return a preview — first user message per conversation
    const items = conversations.map((c) => {
      const firstUserMsg = c.messages.find((m) => m.role === "user");
      const lastMsg = c.messages[c.messages.length - 1];
      return {
        id: c._id,
        preview: firstUserMsg?.content?.slice(0, 80) ?? "New conversation",
        lastMessage: lastMsg?.content?.slice(0, 80) ?? "",
        messageCount: c.messages.length,
        flagged: c.flagged,
        language: c.language,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
      };
    });

    sendSuccess(res, {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  },
);

// ─────────────────────────────────────────────
// GET /api/chat/conversations/:id
// Private — returns full conversation with messages
// ─────────────────────────────────────────────

export const getConversation = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId } = (req as AuthRequest).user;
    const { id } = req.params;

    const conversation = await Conversation.findOne({ _id: id, userId }).lean();
    if (!conversation) throw Errors.notFound("Conversation not found");

    sendSuccess(res, { conversation });
  },
);

// ─────────────────────────────────────────────
// DELETE /api/chat/conversations/:id
// Private — deletes a conversation
// ─────────────────────────────────────────────

export const deleteConversation = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId } = (req as AuthRequest).user;
    const { id } = req.params;

    const conversation = await Conversation.findOneAndDelete({
      _id: id,
      userId,
    });
    if (!conversation) throw Errors.notFound("Conversation not found");

    sendSuccess(res, { message: "Conversation deleted" });
  },
);

// ─────────────────────────────────────────────
// GET /api/chat/flagged
// Facilitators only — view all flagged conversations
// ─────────────────────────────────────────────

export const getFlaggedConversations = asyncHandler(
  async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      Conversation.find({ flagged: true })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email ageGroup facilitatorId")
        .lean(),
      Conversation.countDocuments({ flagged: true }),
    ]);

    sendSuccess(res, {
      items: conversations,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  },
);
