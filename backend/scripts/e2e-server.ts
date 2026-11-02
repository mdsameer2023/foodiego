import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { loadEnv } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { attachRealtime, closeRealtime } from "../src/services/realtime.js";
if (process.env.FOODIEGO_E2E_ISOLATED !== "1")
  throw new Error(
    "Set FOODIEGO_E2E_ISOLATED=1 to start the isolated test backend",
  );
const apiPort = Number(process.env.FOODIEGO_E2E_API_PORT || 5000),
  frontendPort = Number(process.env.FOODIEGO_E2E_FRONTEND_PORT || 3000);
if (
  ![apiPort, frontendPort].every(
    (port) => Number.isInteger(port) && port >= 1024 && port <= 65535,
  )
)
  throw new Error("Invalid isolated E2E port");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
console.log("Isolated E2E: starting temporary MongoDB replica set");
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
console.log("Isolated E2E: replica set ready; seeding temporary catalog");
const values = {
  ...process.env,
  NODE_ENV: "test",
  PORT: String(apiPort),
  MONGODB_URI: mongo.getUri(),
  FRONTEND_URL: `http://localhost:${frontendPort}`,
  BACKEND_URL: `http://localhost:${apiPort}`,
  JWT_ACCESS_SECRET: "isolated-e2e-access-secret-never-for-deployment",
  JWT_REFRESH_SECRET: "isolated-e2e-refresh-secret-never-for-deployment",
  EMAIL_MODE: "disabled",
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
  RAZORPAY_WEBHOOK_SECRET: "",
  GEMINI_API_KEY: "",
  GEMINI_MODEL: "",
};
Object.assign(process.env, values);
const runner = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
// Keep draining mongod stdout/stderr while the seed process writes indexes/data.
// spawnSync blocks this event loop and can fill mongod's pipes on Windows.
const seedStatus = await new Promise<number | null>((resolve, reject) => {
  const child = spawn(process.execPath, [runner, "scripts/seed.ts"], {
    cwd: root, env: values, stdio: "inherit",
  });
  child.once("error", reject);
  child.once("exit", resolve);
}).catch(async () => { await mongo.stop(); throw new Error("Isolated seed could not start"); });
if (seedStatus !== 0) {
  await mongo.stop();
  throw new Error("Isolated seed failed");
}
const env = loadEnv(values);
await connectDatabase(env.MONGODB_URI);
const server = createServer(
  createApp(env, { aiProvider: null, paymentGateway: null }),
);
attachRealtime(server, env);
let closed = false;
async function close() {
  if (closed) return;
  closed = true;
  await closeRealtime();
  if (server.listening)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await disconnectDatabase();
  await mongo.stop();
}
server.on("error", () => {
  void close().finally(() => {
    process.exitCode = 1;
  });
});
process.on("SIGTERM", () => {
  void close().then(() => process.exit(0));
});
process.on("SIGINT", () => {
  void close().then(() => process.exit(0));
});
server.listen(apiPort, "localhost", () =>
  console.log(
    `Isolated E2E backend ready on localhost:${apiPort}; database is temporary and contains sample data only.`,
  ),
);
