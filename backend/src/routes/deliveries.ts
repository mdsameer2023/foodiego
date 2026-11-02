import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Env } from '../config/env.js';
import { requireAuth,requireRole } from '../middleware/auth.js';
import * as controller from '../controllers/deliveries.js';

export function deliveryRoutes(env:Env){
  controller.configureTracking(env);
  const router=Router();router.use(requireAuth(env));
  const locationLimit=rateLimit({windowMs:60_000,limit:30,standardHeaders:'draft-8',legacyHeaders:false});
  router.post('/partners',requireRole('ADMIN'),controller.createPartner);
  router.post('/assign',requireRole('ADMIN'),controller.assign);
  router.get('/mine',requireRole('DELIVERY_PARTNER'),controller.mine);
  router.post('/order/:orderId/completion-code',rateLimit({windowMs:60_000,limit:3,standardHeaders:'draft-8',legacyHeaders:false}),controller.requestCompletionCode);
  router.get('/order/:orderId',controller.byOrder);
  router.get('/:id',controller.getDelivery);
  router.post('/:id/accept',requireRole('DELIVERY_PARTNER'),controller.accept);
  router.post('/:id/reject',requireRole('DELIVERY_PARTNER'),controller.reject);
  router.post('/:id/pickup',requireRole('DELIVERY_PARTNER'),controller.pickup);
  router.post('/:id/start',requireRole('DELIVERY_PARTNER'),controller.startDelivery);
  router.post('/:id/complete',requireRole('DELIVERY_PARTNER'),controller.complete);
  router.post('/:id/tracking/start',requireRole('DELIVERY_PARTNER'),controller.startTracking);
  router.post('/:id/tracking/stop',requireRole('DELIVERY_PARTNER'),controller.stopTracking);
  router.post('/:id/location',requireRole('DELIVERY_PARTNER'),locationLimit,controller.updateLocation);
  return router;
}
