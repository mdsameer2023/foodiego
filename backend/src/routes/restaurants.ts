import { Router } from 'express';
import { getMenu, getMenuCategories, getMenuItems, getRestaurant, listCuisines, listRestaurants, listReviews, searchSuggestions } from '../controllers/restaurants.js';
import { createReview } from '../controllers/reviews.js';
import { requireAuth } from '../middleware/auth.js';
import type { Env } from '../config/env.js';
import { rateLimit } from 'express-rate-limit';
import { sitemapRestaurants } from '../controllers/restaurants.js';
export const restaurantRoutes = Router();
restaurantRoutes.get('/',listRestaurants);
restaurantRoutes.get('/search',searchSuggestions);
restaurantRoutes.get('/cuisines',listCuisines);
restaurantRoutes.get('/sitemap',sitemapRestaurants);
restaurantRoutes.get('/:id',getRestaurant);
restaurantRoutes.get('/:id/menu',getMenu);
restaurantRoutes.get('/:id/menu/categories',getMenuCategories);
restaurantRoutes.get('/:id/menu/items',getMenuItems);
restaurantRoutes.get('/:id/reviews',listReviews);
export function restaurantReviewRoutes(env:Env) {
  const router = Router();
  router.post('/:id/reviews',requireAuth(env),rateLimit({windowMs:60_000,limit:5,standardHeaders:'draft-8',legacyHeaders:false}),createReview);
  return router;
}
