import mongoose from "mongoose";

const subscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      unique: true,
    },
    consent: {
      type: Boolean,
      required: true,
      default: false,
    },
    consentAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    source: {
      type: String,
      default: "oddkin-site",
      maxlength: 64,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

subscriberSchema.index({ createdAt: 1 });

const Subscriber =
  mongoose.models.Subscriber || mongoose.model("Subscriber", subscriberSchema);

export default Subscriber;
