import mongoose, { Document, Schema } from "mongoose";

export type GoalPillar =
  | "menstrual_hygiene"
  | "environment"
  | "digital_skills"
  | "life_skills"
  | "personal";

export type GoalStatus = "not_started" | "in_progress" | "done";

export interface IGoalStep {
  _id?: import('mongoose').Types.ObjectId;
  text: string;
  done: boolean;
}

export interface IGoal extends Document {
  userId:   mongoose.Types.ObjectId;
  title:    string;
  pillar:   GoalPillar;
  deadline: Date | null;
  steps:    IGoalStep[];
  status:   GoalStatus;
  createdAt: Date;
  updatedAt: Date;
}

const GoalStepSchema = new Schema<IGoalStep>(
  {
    text: { type: String, required: true, maxlength: 200 },
    done: { type: Boolean, default: false },
  },
  { _id: true },
);

const GoalSchema = new Schema<IGoal>(
  {
    userId:   { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title:    { type: String, required: true, maxlength: 150 },
    pillar:   {
      type: String,
      enum: ["menstrual_hygiene", "environment", "digital_skills", "life_skills", "personal"],
      default: "personal",
    },
    deadline: { type: Date, default: null },
    steps:    { type: [GoalStepSchema], default: [] },
    status:   { type: String, enum: ["not_started", "in_progress", "done"], default: "not_started" },
  },
  { timestamps: true },
);

GoalSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IGoal>("Goal", GoalSchema);
