import 'dotenv/config';
import { z } from 'zod';
import { loadEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/models/User.js';
import { hashPassword } from '../src/services/auth.js';

async function main() {
  const env = loadEnv();
  const input = z.object({ADMIN_EMAIL:z.email(),ADMIN_PASSWORD:z.string().min(16)}).parse(process.env);
  await connectDatabase(env.MONGODB_URI);
  const email = input.ADMIN_EMAIL.toLowerCase();
  const passwordHash = await hashPassword(input.ADMIN_PASSWORD);
  await User.findOneAndUpdate({email},{$set:{name:'FoodieGo Administrator',email,passwordHash,role:'ADMIN',isActive:true}},{upsert:true,runValidators:true});
  console.log('Administrator bootstrap complete for the configured email.');
  await disconnectDatabase();
}
main().catch(error=>{console.error('Administrator bootstrap failed:',error instanceof Error?error.message:'unknown error');process.exitCode=1;void disconnectDatabase();});
