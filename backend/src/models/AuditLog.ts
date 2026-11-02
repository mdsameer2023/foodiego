import { Schema, model } from "mongoose";
const schema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String, required: true },
    reason: { type: String, default: "" },
    changes: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ createdAt: -1 });
schema.index({ resource: 1, resourceId: 1, createdAt: -1 });
export const AuditLog = model("AuditLog", schema);
