import { Request, Response } from 'express';
import mongoose              from 'mongoose';
import User                  from '../models/User';
import DirectThread          from '../models/DirectThread';
import { AuthRequest }       from '../types';
import { Errors, asyncHandler } from '../utils/appError';
import { sendSuccess }       from '../utils/apiResponse';
import { getIO }             from '../config/socket';

// ─────────────────────────────────────────────
// GET /api/v1/messages
// Girl — fetch (or create) her DM thread with her facilitator.
// Resets girlUnread to 0 and stamps readAt on unread facilitator messages.
// ─────────────────────────────────────────────

export const getMyThread = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;

  const girl = await User.findById(userId).select('facilitatorId').lean();
  if (!girl) throw Errors.notFound('User not found');

  const facilitatorId = girl.facilitatorId;
  if (!facilitatorId) throw Errors.badRequest("You don't have a facilitator yet");

  const now = new Date();

  // Upsert the thread, reset girlUnread and stamp readAt on facilitator messages
  const thread = await DirectThread.findOneAndUpdate(
    { girlId: userId, facilitatorId },
    {
      $setOnInsert: {
        girlId:        new mongoose.Types.ObjectId(userId),
        facilitatorId: facilitatorId,
      },
    },
    { upsert: true, new: true },
  ).populate('facilitatorId', 'name');

  if (!thread) throw Errors.internal('Failed to load thread');

  // Mark unread facilitator messages as read and reset counter
  let changed = false;
  for (const msg of thread.messages) {
    if (msg.sender === 'facilitator' && msg.readAt === null) {
      msg.readAt = now;
      changed = true;
    }
  }
  if (thread.girlUnread > 0 || changed) {
    thread.girlUnread = 0;
    await thread.save();
  }

  // Notify facilitator that girl has read the messages
  try {
    getIO()
      .to(`user:${facilitatorId.toString()}`)
      .emit('dm:read', { by: 'girl', girlId: userId });
  } catch {
    // Socket not yet initialised in tests — silently continue
  }

  sendSuccess(res, { thread });
});

// ─────────────────────────────────────────────
// POST /api/v1/messages
// Girl — send a DM to her facilitator.
// Body: { content: string }
// ─────────────────────────────────────────────

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { content } = req.body as { content?: string };

  if (!content?.trim()) throw Errors.badRequest('Message content is required');
  if (content.trim().length > 2000)
    throw Errors.badRequest('Message cannot exceed 2000 characters');

  const girl = await User.findById(userId).select('name facilitatorId').lean();
  if (!girl) throw Errors.notFound('User not found');

  const facilitatorId = girl.facilitatorId;
  if (!facilitatorId) throw Errors.badRequest("You don't have a facilitator yet");

  const trimmedContent = content.trim();
  const now            = new Date();

  const newMessage = {
    _id:       new mongoose.Types.ObjectId(),
    sender:    'girl' as const,
    content:   trimmedContent,
    timestamp: now,
    readAt:    null,
  };

  const thread = await DirectThread.findOneAndUpdate(
    { girlId: userId, facilitatorId },
    {
      $push:        { messages: newMessage },
      $inc:         { facilitatorUnread: 1 },
      $set:         {
        lastMessageAt: now,
        lastSender:    'girl',
        lastContent:   trimmedContent,
      },
      $setOnInsert: {
        girlId:        new mongoose.Types.ObjectId(userId),
        facilitatorId: facilitatorId,
        girlUnread:    0,
      },
    },
    { upsert: true, new: true },
  );

  if (!thread) throw Errors.internal('Failed to send message');

  // Emit to facilitator
  try {
    getIO()
      .to(`user:${facilitatorId.toString()}`)
      .emit('dm:message', {
        threadId:      thread._id.toString(),
        message:       {
          sender:    newMessage.sender,
          content:   newMessage.content,
          timestamp: newMessage.timestamp.toISOString(),
          readAt:    null,
        },
        girlId:   userId,
        girlName: girl.name,
      });
  } catch {
    // Socket not yet initialised in tests — silently continue
  }

  sendSuccess(res, { message: newMessage }, 201);
});
