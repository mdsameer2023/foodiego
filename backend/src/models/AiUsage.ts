import { Schema, model } from "mongoose";
const schema = new Schema(
  {
    day: { type: String, required: true, unique: true },
    requests: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    failures: { type: Number, default: 0 },
    fallbacks: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AiUsage = model("AiUsage", schema);
