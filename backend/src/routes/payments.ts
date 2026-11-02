import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Env } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { paymentController } from '../controllers/payments.js';
import type { PaymentGateway } from '../services/payment-gateway.js';

export function paymentRoutes(env:Env,gateway:PaymentGateway|null){
  const router=Router();const controller=paymentController(env,gateway);
  router.use(requireAuth(env));
  const limit=rateLimit({windowMs:60_000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>String(req.res?.locals.user._id)});
  router.post('/create-order',limit,controller.createOrder);
  router.post('/verify',limit,controller.verify);
  router.get('/:orderId/status',controller.status);
  router.post('/:paymentId/refund',requireRole('ADMIN'),limit,controller.refund);
  router.get('/:paymentId/refunds',requireRole('ADMIN'),controller.refunds);
  return router;
}
