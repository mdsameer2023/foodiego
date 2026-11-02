import mongoose from "mongoose";

let pending: Promise<typeof mongoose> | undefined;
export async function connectDatabase(uri: string, dbName = "foodiego") {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!pending) {
    mongoose.set("bufferCommands", false);
    pending = mongoose
      .connect(uri, {
        dbName,
        serverSelectionTimeoutMS: 8000,
        autoIndex: process.env.NODE_ENV !== "production",
      })
      .catch((error) => {
        pending = undefined;
        throw error;
      });
  }
  return pending;
}
export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  pending = undefined;
}
