import { Router } from 'express';
import type { Env } from '../config/env.js';
import { userController } from '../controllers/users.js';
import { requireAuth } from '../middleware/auth.js';
import { addFavorite, listFavorites, removeFavorite } from '../controllers/favorites.js';
export function userRoutes(env: Env) {
  const router = Router(); const controller = userController(env);
  router.use(requireAuth(env));
  router.get('/profile',controller.profile);
  router.patch('/profile',controller.updateProfile);
  router.patch('/change-password',controller.changePassword);
  router.get('/addresses',controller.listAddresses);
  router.post('/addresses',controller.createAddress);
  router.patch('/addresses/:id',controller.updateAddress);
  router.delete('/addresses/:id',controller.deleteAddress);
  router.get('/favorites',listFavorites);
  router.post('/favorites',addFavorite);
  router.delete('/favorites/:restaurantId',removeFavorite);
  return router;
}
