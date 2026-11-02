import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  FRONTEND_URL: z.url(),
  BACKEND_URL: z.url(),
  EMAIL_MODE: z.enum(['console', 'smtp', 'disabled']).default('disabled'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.email().optional(),
  TRUST_PROXY_HOPS:z.coerce.number().int().min(0).max(3).optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  TRACKING_MIN_INTERVAL_MS: z.coerce.number().int().min(1000).max(120000).default(5000),
  TRACKING_MIN_DISTANCE_METERS: z.coerce.number().min(0).max(1000).default(30),
  TRACKING_STATIONARY_INTERVAL_MS: z.coerce.number().int().min(5000).max(600000).default(30000),
}).superRefine((env, context) => {
  if(env.NODE_ENV==='production'&&(!env.FRONTEND_URL.startsWith('https://')||!env.BACKEND_URL.startsWith('https://')))context.addIssue({code:'custom',message:'Production frontend and backend URLs must use HTTPS'});
  if (env.NODE_ENV === 'production' && env.EMAIL_MODE === 'console') context.addIssue({code:'custom',message:'Console email cannot be used in production'});
  if (env.EMAIL_MODE === 'smtp' && (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM)) context.addIssue({code:'custom',message:'SMTP settings are required for smtp email mode'});
  if (Boolean(env.RAZORPAY_KEY_ID) !== Boolean(env.RAZORPAY_KEY_SECRET)) context.addIssue({code:'custom',message:'Both Razorpay test key ID and secret are required'});
  if (env.RAZORPAY_KEY_ID && !env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) context.addIssue({code:'custom',message:'Only Razorpay test keys are supported'});
});

export type Env = z.infer<typeof envSchema>;
export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(input);
  if (!result.success) throw new Error(`Invalid environment: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return result.data;
}
