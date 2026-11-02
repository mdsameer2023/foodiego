import "dotenv/config";
import { loadEnv } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { ensureDatabaseIndexes } from "../src/config/indexes.js";
try {
  await connectDatabase(loadEnv().MONGODB_URI);
  await ensureDatabaseIndexes(name => console.log(`${name}: declared indexes ensured without dropping indexes or records`));
} catch {
  console.error("Index migration failed. Check index conflicts/duplicate records privately; no records were modified or deleted by this migration.");
  process.exitCode=1;
} finally {
  await disconnectDatabase();
}
