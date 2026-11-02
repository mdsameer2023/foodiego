import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Env } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getCart, addCartItem, patchCartItem, deleteCartItem, clearCart } from '../controllers/cart.js';
import { availableCoupons, validateCoupon } from '../controllers/coupons.js';
import { checkoutQuote } from '../controllers/checkout.js';
import { placeOrder, listOrders, getOrder, cancelOrder, reorder, updateOrderStatus, assignDeliveryPartner } from '../controllers/orders.js';

export function commerceRoutes(env:Env) {
  const router=Router();
  for (const path of ['/cart','/coupons','/checkout','/orders']) router.use(path,requireAuth(env));
  router.get('/cart',getCart);
  router.post('/cart/items',addCartItem);
  router.patch('/cart/items/:itemId',patchCartItem);
  router.delete('/cart/items/:itemId',deleteCartItem);
  router.delete('/cart',clearCart);
  router.get('/coupons/available',availableCoupons);
  router.post('/coupons/validate',validateCoupon);
  router.post('/checkout/quote',checkoutQuote);
  router.post('/orders',rateLimit({windowMs:60_000,limit:10,standardHeaders:'draft-8',legacyHeaders:false}),placeOrder);
  router.get('/orders',listOrders);
  router.get('/orders/:id',getOrder);
  router.post('/orders/:id/cancel',cancelOrder);
  router.post('/orders/:id/reorder',reorder);
  router.patch('/orders/:id/assign-partner',requireRole('ADMIN'),assignDeliveryPartner);
  router.patch('/orders/:id/status',requireRole('RESTAURANT_OWNER','DELIVERY_PARTNER','ADMIN'),updateOrderStatus);
  return router;
}
