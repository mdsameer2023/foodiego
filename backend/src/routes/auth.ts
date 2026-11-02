import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Env } from '../config/env.js';
import { authController } from '../controllers/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfIssuer } from '../middleware/csrf.js';

export function authRoutes(env: Env) {
  const router = Router(); const controller = authController(env);
  const authLimit = rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMITED',message:'Too many attempts. Please try again later'}}});
  const refreshLimit = rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMITED',message:'Too many attempts. Please try again later'}}});
  router.get('/csrf',csrfIssuer(env));
  router.post('/register',authLimit,controller.register);
  router.post('/login',authLimit,controller.login);
  router.post('/logout',controller.logout);
  router.post('/refresh',refreshLimit,controller.refresh);
  router.get('/me',requireAuth(env),controller.me);
  router.post('/forgot-password',authLimit,controller.forgotPassword);
  router.post('/reset-password',authLimit,controller.resetPassword);
  return router;
}
