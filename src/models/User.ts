import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type UserRole     = 'girl' | 'facilitator' | 'admin';
export type AgeGroupUser = '10-13' | '14-18' | null;

export interface IUser extends Document {
  _id:              mongoose.Types.ObjectId;
  name:             string;
  email:            string;
  password:         string;
  role:             UserRole;
  ageGroup:         AgeGroupUser;
  consentGiven:     boolean;
  consentAt:        Date | null;
  preferredLang:    string;
  avatar:           string | null;
  facilitatorId:    mongoose.Types.ObjectId | null;
  isActive:         boolean;
  lastLoginAt:      Date | null;
  // Learning progress
  savedTopics:      string[];        // topic IDs bookmarked from resources page
  resourcesVisited: string[];        // topic IDs the user has viewed/explored
  badges:           string[];        // earned badge keys e.g. "pillar_1_complete"
  groupCode:        string | null;   // facilitator-only: short code girls use to join their cohort
  createdAt:        Date;
  updatedAt:        Date;

  comparePassword(candidate: string): Promise<boolean>;
}

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const UserSchema = new Schema<IUser>(
  {
    name: {
      type:     String,
      required: [true, 'Name is required'],
      trim:     true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type:      String,
      required:  [true, 'Email is required'],
      lowercase: true,
      trim:      true,
      match:     [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type:     String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select:   false,   // never returned in queries by default
    },
    role: {
      type:    String,
      enum:    ['girl', 'facilitator', 'admin'],
      default: 'girl',
    },
    ageGroup: {
      type:    String,
      enum:    ['10-13', '14-18', null],
      default: null,
    },
    consentGiven:  { type: Boolean, default: false },
    consentAt:     { type: Date,    default: null  },
    preferredLang: { type: String,  default: 'en'  },
    avatar:       { type: String,  default: null  },
    facilitatorId:{
      type:    Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
    isActive:         { type: Boolean,   default: true  },
    lastLoginAt:      { type: Date,      default: null  },
    savedTopics:      { type: [String],  default: []    },
    resourcesVisited: { type: [String],  default: []    },
    badges:           { type: [String],  default: []    },
    groupCode:        { type: String,    default: null  },
  },
  { timestamps: true }
);

// ─────────────────────────────────────────────
// Pre-save: hash password
// ─────────────────────────────────────────────

UserSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt    = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ─────────────────────────────────────────────
// Instance method
// ─────────────────────────────────────────────

UserSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

// ─────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────

UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ facilitatorId: 1 });
UserSchema.index({ groupCode: 1 }, { unique: true, sparse: true }); // sparse: null values excluded

export default mongoose.model<IUser>('User', UserSchema);