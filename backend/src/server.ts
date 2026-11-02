import { createServer } from 'node:http';
import { loadEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { attachRealtime,closeRealtime } from './services/realtime.js';

async function main() {
  const env = loadEnv();
  while (true) {
    try {
      await connectDatabase(env.MONGODB_URI);
      break;
    } catch (error) {
      if (env.NODE_ENV !== 'development') throw error;
      logger.warn({err:error},'MongoDB unavailable; retrying in 10 seconds');
      await new Promise(resolve=>setTimeout(resolve,10_000));
    }
  }
  logger.info('MongoDB connected');
  const server = createServer(createApp(env));
  attachRealtime(server,env);
  server.listen(env.PORT,()=>logger.info({port:env.PORT},'FoodieGo API ready'));
  let closing = false;
  async function close(signal: string) {
    if (closing) return; closing = true;
    logger.info({signal},'Shutting down');
    setTimeout(()=>process.exit(1),10000).unref();
    await closeRealtime();
    if(!server.listening){await disconnectDatabase();process.exit(0);return;}
    server.close(async error=>{if (error) logger.error({err:error},'HTTP shutdown error'); await disconnectDatabase(); process.exit(error?1:0);});
  }
  process.on('SIGINT',()=>void close('SIGINT'));
  process.on('SIGTERM',()=>void close('SIGTERM'));
}
main().catch(error=>{logger.error({err:error},'Startup failed');process.exitCode=1;});
