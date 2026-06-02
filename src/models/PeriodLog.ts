import mongoose, { Document, Schema } from "mongoose";

export interface IPeriodLog extends Document {
  userId:    mongoose.Types.ObjectId;
  startDate: Date;
  endDate:   Date | null;
  duration:  number | null;          // days
  flow:      "light" | "medium" | "heavy";
  notes:     string;
  createdAt: Date;
  updatedAt: Date;
}

const PeriodLogSchema = new Schema<IPeriodLog>(
  {
    userId:    { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startDate: { type: Date, required: true },
    endDate:   { type: Date, default: null },
    duration:  { type: Number, default: null },
    flow:      { type: String, enum: ["light", "medium", "heavy"], default: "medium" },
    notes:     { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true },
);

PeriodLogSchema.index({ userId: 1, startDate: -1 });

export default mongoose.model<IPeriodLog>("PeriodLog", PeriodLogSchema);
