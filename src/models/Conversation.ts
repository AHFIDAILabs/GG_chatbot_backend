import mongoose, { Document, Schema } from 'mongoose';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type MessageRole       = 'user' | 'assistant';
export type Language          = 'en' | 'pidgin' | 'yoruba' | 'hausa';
export type FacilitatorStatus = 'pending' | 'reviewed' | 'resolved';
export type Intent            =
  | 'menstrual_hygiene'
  | 'environment'
  | 'digital_skills'
  | 'life_skills'
  | 'safeguarding'
  | 'off_topic'
  | 'greeting';

export interface IMessage {
  role:            MessageRole;
  content:         string;
  intent:          Intent | null;
  retrievedChunks: string[];     // raw text snippets used to ground the answer
  pillarSource:    string | null;// e.g. "Period & Menstrual Hygiene – Menstrual Cycle Science"
  tokensUsed:      number;
  latencyMs:       number;
  timestamp:       Date;
}

export interface IConversation extends Document {
  _id:               mongoose.Types.ObjectId;
  userId:            mongoose.Types.ObjectId | null;  // null = anonymous session
  ageGroup:          '10-13' | '14-18' | null;
  messages:          IMessage[];
  isAnonymous:       boolean;
  language:          Language;
  flagged:           boolean;
  flagReason:        string | null;
  // Facilitator workflow (only populated when flagged = true)
  facilitatorStatus: FacilitatorStatus;
  facilitatorNote:   string | null;   // internal note visible only to facilitator
  facilitatorReply:  string | null;   // message sent back to the girl
  reviewedBy:        mongoose.Types.ObjectId | null;
  reviewedAt:        Date | null;
  createdAt:         Date;
  updatedAt:         Date;
}

// ─────────────────────────────────────────────
// Sub-schema: Message
// ─────────────────────────────────────────────

const MessageSchema = new Schema<IMessage>(
  {
    role: {
      type:     String,
      enum:     ['user', 'assistant'],
      required: true,
    },
    content: {
      type:     String,
      required: true,
    },
    intent: {
      type:    String,
      enum:    ['menstrual_hygiene','environment','digital_skills','life_skills','safeguarding','off_topic','greeting', null],
      default: null,
    },
    retrievedChunks: { type: [String], default: [] },
    pillarSource:    { type: String,   default: null },
    tokensUsed:      { type: Number,   default: 0   },
    latencyMs:       { type: Number,   default: 0   },
    timestamp:       { type: Date,     default: () => new Date() },
  },
  { _id: false }
);

// ─────────────────────────────────────────────
// Main Schema
// ─────────────────────────────────────────────

const ConversationSchema = new Schema<IConversation>(
  {
    userId: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      default:  null,
    },
    ageGroup: {
      type:    String,
      enum:    ['10-13', '14-18', null],
      default: null,
    },
    messages:    { type: [MessageSchema], default: [] },
    isAnonymous: { type: Boolean, default: false       },
    language:    { type: String,  default: 'en'        },
    flagged:     { type: Boolean, default: false       },
    flagReason:  { type: String,  default: null        },
    facilitatorStatus: {
      type:    String,
      enum:    ['pending', 'reviewed', 'resolved'],
      default: 'pending',
    },
    facilitatorNote:  { type: String,                default: null },
    facilitatorReply: { type: String,                default: null },
    reviewedBy:       { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt:       { type: Date,                  default: null },
  },
  { timestamps: true }
);

// ─────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────

ConversationSchema.index({ userId: 1, createdAt: -1 });
ConversationSchema.index({ flagged: 1 });
ConversationSchema.index({ flagged: 1, facilitatorStatus: 1 });

export default mongoose.model<IConversation>('Conversation', ConversationSchema);