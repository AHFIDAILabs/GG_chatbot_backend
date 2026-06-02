import { Request, Response } from 'express';
import mongoose              from 'mongoose';
import Conversation          from '../models/Conversation';
import User                  from '../models/User';
import DirectThread          from '../models/DirectThread';
import { AuthRequest }       from '../types';
import { Errors, asyncHandler } from '../utils/appError';
import { sendSuccess }       from '../utils/apiResponse';
import { getIO }             from '../config/socket';

// ─────────────────────────────────────────────
// GET /api/v1/facilitator/flagged
// Facilitator — paginated list of flagged conversations
// Query params: status (pending|reviewed|resolved), page, limit
// ─────────────────────────────────────────────

export const getFlaggedConversations = asyncHandler(
  async (req: Request, res: Response) => {
    const limit  = Math.min(parseInt((req.query.limit as string) ?? '20', 10), 100);
    const page   = Math.max(parseInt((req.query.page  as string) ??  '1', 10), 1);

    const filter: Record<string, unknown> = { flagged: true };
    if (req.query.status) filter['facilitatorStatus'] = req.query.status;

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name email ageGroup')
        .populate('reviewedBy', 'name email')
        .lean(),
      Conversation.countDocuments(filter),
    ]);

    sendSuccess(res, {
      conversations,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  },
);

// ─────────────────────────────────────────────
// PATCH /api/v1/facilitator/conversations/:id/acknowledge
// Facilitator — mark a flagged conversation as reviewed
// Body: { note?: string }
// ─────────────────────────────────────────────

export const acknowledge = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { id }     = req.params;

  if (!mongoose.isValidObjectId(id)) throw Errors.badRequest('Invalid conversation ID');

  const conversation = await Conversation.findOneAndUpdate(
    { _id: id, flagged: true },
    {
      $set: {
        facilitatorStatus: 'reviewed',
        facilitatorNote:   req.body.note ?? null,
        reviewedBy:        userId,
        reviewedAt:        new Date(),
      },
    },
    { new: true },
  );

  if (!conversation) throw Errors.notFound('Flagged conversation not found');

  sendSuccess(res, { conversation });
});

// ─────────────────────────────────────────────
// POST /api/v1/facilitator/conversations/:id/reply
// Facilitator — send a reply message to the girl
// Body: { reply: string }
// ─────────────────────────────────────────────

export const replyToGirl = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { id }     = req.params;
  const { reply }  = req.body;

  if (!reply?.trim()) throw Errors.badRequest('Reply message is required');
  if (!mongoose.isValidObjectId(id)) throw Errors.badRequest('Invalid conversation ID');

  const conversation = await Conversation.findOneAndUpdate(
    { _id: id, flagged: true },
    {
      $set: {
        facilitatorReply:  reply.trim(),
        facilitatorStatus: 'reviewed',
        reviewedBy:        userId,
        reviewedAt:        new Date(),
      },
    },
    { new: true },
  );

  if (!conversation) throw Errors.notFound('Flagged conversation not found');

  sendSuccess(res, { conversation });
});

// ─────────────────────────────────────────────
// PATCH /api/v1/facilitator/conversations/:id/resolve
// Facilitator — mark a conversation as fully resolved
// ─────────────────────────────────────────────

export const resolve = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { id }     = req.params;

  if (!mongoose.isValidObjectId(id)) throw Errors.badRequest('Invalid conversation ID');

  const conversation = await Conversation.findOneAndUpdate(
    { _id: id, flagged: true },
    {
      $set: {
        facilitatorStatus: 'resolved',
        reviewedBy:        userId,
        reviewedAt:        new Date(),
      },
    },
    { new: true },
  );

  if (!conversation) throw Errors.notFound('Flagged conversation not found');

  sendSuccess(res, { conversation });
});

// ─────────────────────────────────────────────
// GET /api/v1/facilitator/girls
// Facilitator — list girls assigned to this facilitator
// ─────────────────────────────────────────────

export const getGirls = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const limit  = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);
  const page   = Math.max(parseInt((req.query.page  as string) ??  '1', 10), 1);

  const [girls, total] = await Promise.all([
    User.find({ facilitatorId: userId, role: 'girl' })
      .select('name email ageGroup badges savedTopics resourcesVisited lastLoginAt createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments({ facilitatorId: userId, role: 'girl' }),
  ]);

  sendSuccess(res, { girls, total, page, totalPages: Math.ceil(total / limit) });
});

// ─────────────────────────────────────────────
// GET /api/v1/facilitator/girls/:girlId/progress
// Facilitator — detailed learning progress for one girl
// ─────────────────────────────────────────────

export const getGirlProgress = asyncHandler(async (req: Request, res: Response) => {
  const { userId }  = (req as AuthRequest).user;
  const { girlId }  = req.params;

  if (!mongoose.isValidObjectId(girlId)) throw Errors.badRequest('Invalid user ID');

  // Ensure the girl is assigned to this facilitator
  const girl = await User.findOne({ _id: girlId, facilitatorId: userId, role: 'girl' })
    .select('name email ageGroup badges savedTopics resourcesVisited lastLoginAt createdAt')
    .lean();

  if (!girl) throw Errors.notFound('Girl not found or not assigned to you');

  // Count flagged conversations for this girl
  const flaggedCount = await Conversation.countDocuments({ userId: girlId, flagged: true });

  sendSuccess(res, {
    girl: {
      ...girl,
      flaggedConversations: flaggedCount,
    },
  });
});

// ─────────────────────────────────────────────
// GET /api/v1/facilitator/messages
// Facilitator — list all DM threads with unread summary
// ─────────────────────────────────────────────

export const getMessageThreads = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;

  const threads = await DirectThread.find({ facilitatorId: userId })
    .populate('girlId', 'name ageGroup')
    .sort({ lastMessageAt: -1 })
    .lean();

  const totalUnread = threads.reduce((sum, t) => sum + (t.facilitatorUnread ?? 0), 0);

  sendSuccess(res, { threads, totalUnread });
});

// ─────────────────────────────────────────────
// GET /api/v1/facilitator/messages/:girlId
// Facilitator — fetch (or create) thread with a specific girl.
// Resets facilitatorUnread to 0 and stamps readAt on unread girl messages.
// ─────────────────────────────────────────────

export const getThreadWithGirl = asyncHandler(async (req: Request, res: Response) => {
  const { userId }  = (req as AuthRequest).user;
  const { girlId }  = req.params;

  if (!mongoose.isValidObjectId(girlId)) throw Errors.badRequest('Invalid girl ID');

  const now = new Date();

  const thread = await DirectThread.findOneAndUpdate(
    { girlId, facilitatorId: userId },
    {
      $setOnInsert: {
        girlId:        new mongoose.Types.ObjectId(girlId),
        facilitatorId: new mongoose.Types.ObjectId(userId),
      },
    },
    { upsert: true, new: true },
  ).populate('girlId', 'name ageGroup lastLoginAt');

  if (!thread) throw Errors.internal('Failed to load thread');

  // Mark unread girl messages as read and reset counter
  let changed = false;
  for (const msg of thread.messages) {
    if (msg.sender === 'girl' && msg.readAt === null) {
      msg.readAt = now;
      changed = true;
    }
  }
  if (thread.facilitatorUnread > 0 || changed) {
    thread.facilitatorUnread = 0;
    await thread.save();
  }

  // Notify the girl that her messages were read
  try {
    getIO()
      .to(`user:${girlId}`)
      .emit('dm:read', { by: 'facilitator' });
  } catch {
    // Socket not yet initialised in tests — silently continue
  }

  sendSuccess(res, { thread });
});

// ─────────────────────────────────────────────
// POST /api/v1/facilitator/messages/:girlId
// Facilitator — send a DM to a specific girl.
// Body: { content: string }
// ─────────────────────────────────────────────

export const sendMessageToGirl = asyncHandler(async (req: Request, res: Response) => {
  const { userId }  = (req as AuthRequest).user;
  const { girlId }  = req.params;
  const { content } = req.body as { content?: string };

  if (!mongoose.isValidObjectId(girlId)) throw Errors.badRequest('Invalid girl ID');
  if (!content?.trim()) throw Errors.badRequest('Message content is required');
  if (content.trim().length > 2000)
    throw Errors.badRequest('Message cannot exceed 2000 characters');

  // Verify the girl belongs to this facilitator
  const girl = await User.findOne({ _id: girlId, facilitatorId: userId, role: 'girl' })
    .select('_id')
    .lean();
  if (!girl) throw Errors.forbidden('Girl not found or not assigned to you');

  const trimmedContent = content.trim();
  const now            = new Date();

  const newMessage = {
    _id:       new mongoose.Types.ObjectId(),
    sender:    'facilitator' as const,
    content:   trimmedContent,
    timestamp: now,
    readAt:    null,
  };

  const thread = await DirectThread.findOneAndUpdate(
    { girlId, facilitatorId: userId },
    {
      $push:        { messages: newMessage },
      $inc:         { girlUnread: 1 },
      $set:         {
        lastMessageAt: now,
        lastSender:    'facilitator',
        lastContent:   trimmedContent,
      },
      $setOnInsert: {
        girlId:            new mongoose.Types.ObjectId(girlId),
        facilitatorId:     new mongoose.Types.ObjectId(userId),
        facilitatorUnread: 0,
      },
    },
    { upsert: true, new: true },
  );

  if (!thread) throw Errors.internal('Failed to send message');

  // Emit to the girl
  try {
    getIO()
      .to(`user:${girlId}`)
      .emit('dm:message', {
        threadId:      thread._id.toString(),
        message:       {
          sender:    newMessage.sender,
          content:   newMessage.content,
          timestamp: newMessage.timestamp.toISOString(),
          readAt:    null,
        },
        facilitatorId: userId,
      });
  } catch {
    // Socket not yet initialised in tests — silently continue
  }

  sendSuccess(res, { message: newMessage }, 201);
});
