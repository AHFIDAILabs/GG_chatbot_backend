import mongoose, { Document, Schema } from 'mongoose';

export interface IDirectMessage {
  _id:       mongoose.Types.ObjectId;
  sender:    'girl' | 'facilitator';
  content:   string;
  timestamp: Date;
  readAt:    Date | null;
}

export interface IDirectThread extends Document {
  girlId:            mongoose.Types.ObjectId;
  facilitatorId:     mongoose.Types.ObjectId;
  messages:          IDirectMessage[];
  girlUnread:        number;
  facilitatorUnread: number;
  lastMessageAt:     Date | null;
  lastSender:        'girl' | 'facilitator' | null;
  lastContent:       string;
  createdAt:         Date;
  updatedAt:         Date;
}

const DirectMessageSchema = new Schema<IDirectMessage>({
  sender:    { type: String, enum: ['girl', 'facilitator'], required: true },
  content:   { type: String, required: true, maxlength: 2000 },
  timestamp: { type: Date, default: Date.now },
  readAt:    { type: Date, default: null },
});

const DirectThreadSchema = new Schema<IDirectThread>(
  {
    girlId:            { type: Schema.Types.ObjectId, ref: 'User', required: true },
    facilitatorId:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    messages:          { type: [DirectMessageSchema], default: [] },
    girlUnread:        { type: Number, default: 0 },
    facilitatorUnread: { type: Number, default: 0 },
    lastMessageAt:     { type: Date, default: null },
    lastSender:        { type: String, enum: ['girl', 'facilitator', null], default: null },
    lastContent:       { type: String, default: '' },
  },
  { timestamps: true },
);

DirectThreadSchema.index({ girlId: 1, facilitatorId: 1 }, { unique: true });
DirectThreadSchema.index({ facilitatorId: 1, lastMessageAt: -1 });

export default mongoose.model<IDirectThread>('DirectThread', DirectThreadSchema);
