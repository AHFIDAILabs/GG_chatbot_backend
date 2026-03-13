import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type UserRole     = 'girl' | 'facilitator';
export type AgeGroupUser = '10-13' | '14-18' | null;

export interface IUser extends Document {
  _id:           mongoose.Types.ObjectId;
  name:          string;
  email:         string;
  password:      string;
  role:          UserRole;
  ageGroup:      AgeGroupUser;       // only relevant for girls
  consentGiven:  boolean;            // parental/self consent for under-18
  consentAt:     Date | null;
  preferredLang: string;             // 'en' | 'pidgin' | 'yoruba' | 'hausa'
  avatar:        string | null;      // Cloudinary URL
  facilitatorId: mongoose.Types.ObjectId | null; // which facilitator supervises this girl
  isActive:      boolean;
  lastLoginAt:   Date | null;
  createdAt:     Date;
  updatedAt:     Date;

  // Instance methods
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
      enum:    ['girl', 'facilitator'],
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
    isActive:   { type: Boolean, default: true },
    lastLoginAt:{ type: Date,    default: null },
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

export default mongoose.model<IUser>('User', UserSchema);