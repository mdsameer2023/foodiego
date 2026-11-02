import nodemailer from 'nodemailer';
import type { Env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/errors.js';

export async function sendPasswordReset(env: Env, address: string, token: string) {
  const link = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
  if (env.EMAIL_MODE === 'console' && env.NODE_ENV !== 'production') {
    logger.info({address,resetLink:link},'development password reset link');
    return;
  }
  if (env.EMAIL_MODE === 'disabled') throw new ApiError(503,'EMAIL_UNAVAILABLE','Password recovery is not configured');
  const transport = nodemailer.createTransport({host:env.SMTP_HOST,port:env.SMTP_PORT,secure:env.SMTP_PORT===465,auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}});
  await transport.sendMail({from:env.SMTP_FROM,to:address,subject:'Reset your FoodieGo password',text:`Reset your password using this link (expires in 20 minutes): ${link}`});
}
