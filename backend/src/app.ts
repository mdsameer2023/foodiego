import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttpModule from 'pino-http';
import type { Env } from './config/env.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { restaurantRoutes, restaurantReviewRoutes } from './routes/restaurants.js';
import { searchMenuItems, trendingMenuItems } from './controllers/menu-items.js';
import { updateReview, deleteReview } from './controllers/reviews.js';
import { requireAuth } from './middleware/auth.js';
import { requireCsrf } from './middleware/csrf.js';
import { ApiError, errorHandler, notFound } from './utils/errors.js';
import { logger, safeLogError } from './utils/logger.js';
import { commerceRoutes } from './routes/commerce.js';
import { paymentRoutes } from './routes/payments.js';
import { deliveryRoutes } from './routes/deliveries.js';
import { dashboardRoutes } from './routes/dashboards.js';
import { aiRoutes } from './routes/ai.js';
import type { AiProvider,AiSettings } from './services/ai/gemini.service.js';
import mongoose from 'mongoose';
import { requireRole } from './middleware/auth.js';
import { monitorRequests,monitoringSnapshot } from './services/monitoring.js';
import { paymentController } from './controllers/payments.js';
import { createPaymentGateway, type PaymentGateway } from './services/payment-gateway.js';

export function createApp(env: Env, options:{paymentGateway?:PaymentGateway|null;aiProvider?:AiProvider|null;aiSettings?:AiSettings}={}) {
  const app = express();
  const paymentGateway=options.paymentGateway===undefined?createPaymentGateway(env):options.paymentGateway;
  if (env.NODE_ENV === 'production') app.set('trust proxy',env.TRUST_PROXY_HOPS??1);
  app.disable('x-powered-by');
  app.use(monitorRequests);
  app.use(pinoHttpModule.default({logger,autoLogging:env.NODE_ENV!=='test',serializers:{err:safeLogError,req:req=>({id:req.id,method:req.method,url:String(req.url||'').split('?')[0]})},redact:['req.headers.cookie','req.headers.authorization','req.headers.x-csrf-token','res.headers.set-cookie']}));
  app.use(helmet());
  app.use(cors({origin(origin,callback){ if (!origin || origin===env.FRONTEND_URL || origin===env.BACKEND_URL) callback(null,true); else callback(new ApiError(403,'ORIGIN_REJECTED','Origin not allowed')); },credentials:true,methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','X-CSRF-Token']}));
  app.post('/api/payments/webhook',express.raw({type:'application/json',limit:'256kb'}),paymentController(env,paymentGateway).webhook);
  app.use('/api/owner/images',express.json({limit:'6mb'}));
  app.use(express.json({limit:'32kb'}));
  app.use(cookieParser());
  app.get('/api/health',(_req,res)=>{res.json({data:{status:'ok'}});});
  app.get('/api/health/ready',async(_req,res)=>{
    try{if(mongoose.connection.readyState!==1||!mongoose.connection.db)throw new Error('not ready');await mongoose.connection.db.admin().ping({maxTimeMS:1000});res.json({data:{status:'ready',database:'connected'}});}
    catch{res.status(503).json({data:{status:'unavailable',database:'unavailable'}});}
  });
  app.use('/api',requireCsrf(env));
  app.use('/api/auth',authRoutes(env));
  app.get('/api/admin/monitoring',requireAuth(env),requireRole('ADMIN'),(_req,res)=>res.json({data:monitoringSnapshot()}));
  app.use('/api/users',userRoutes(env));
  app.use('/api',commerceRoutes(env));
  app.use('/api/payments',paymentRoutes(env,paymentGateway));
  app.use('/api/deliveries',deliveryRoutes(env));
  app.use('/api',dashboardRoutes(env));
  app.use('/api/ai',aiRoutes(env,options));
  app.use('/api/restaurants',restaurantRoutes);
  app.use('/api/restaurants',restaurantReviewRoutes(env));
  app.get('/api/menu-items/search',searchMenuItems);
  app.get('/api/menu-items/trending',trendingMenuItems);
  app.patch('/api/reviews/:id',requireAuth(env),updateReview);
  app.delete('/api/reviews/:id',requireAuth(env),deleteReview);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
