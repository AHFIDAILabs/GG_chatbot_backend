import mongoose, { Document, Schema } from 'mongoose';

export interface IFacilitatorInvite extends Document {
  token:     string;                            // UUID — the shareable token
  expiresAt: Date;                              // default: 48 h from creation
  used:      boolean;
  usedBy:    mongoose.Types.ObjectId | null;    // facilitator who consumed it
  note:      string;                            // optional admin note (e.g. "For Abuja cohort 2025")
  createdAt: Date;
  updatedAt: Date;
}

const FacilitatorInviteSchema = new Schema<IFacilitatorInvite>(
  {
    token:     { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date,   required: true },
    used:      { type: Boolean, default: false },
    usedBy:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
    note:      { type: String, default: '' },
  },
  { timestamps: true },
);

// Auto-expire index — MongoDB drops the document 0 s after expiresAt
// (only if unused; used tokens are kept for audit purposes)
FacilitatorInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { used: false } });

export default mongoose.model<IFacilitatorInvite>('FacilitatorInvite', FacilitatorInviteSchema);
