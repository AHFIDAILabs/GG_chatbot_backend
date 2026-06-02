import mongoose, { Document, Schema } from "mongoose";

export type MoodScore = 1 | 2 | 3 | 4 | 5;

export interface IWellbeingLog extends Document {
  userId:    mongoose.Types.ObjectId;
  date:      Date;          // midnight UTC of the day
  mood:      MoodScore;     // 1 = very sad … 5 = very happy
  note:      string;
  createdAt: Date;
  updatedAt: Date;
}

const WellbeingLogSchema = new Schema<IWellbeingLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date:   { type: Date, required: true },
    mood:   { type: Number, enum: [1, 2, 3, 4, 5], required: true },
    note:   { type: String, default: "", maxlength: 300 },
  },
  { timestamps: true },
);

// One entry per user per calendar day
WellbeingLogSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model<IWellbeingLog>("WellbeingLog", WellbeingLogSchema);
