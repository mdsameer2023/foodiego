import type { RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import { User, roles } from '../models/User.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { ApiError } from '../utils/errors.js';
import { verifyAccess } from '../services/auth.js';

export function requireAuth(env: Env): RequestHandler {
  return async (req,res,next) => {
    try {
      const payload = verifyAccess(req.cookies?.fg_access,env);
      const session = await RefreshSession.exists({sessionId:payload.sid,userId:payload.sub,expiresAt:{$gt:new Date()}});
      if (!session) throw new ApiError(401,'UNAUTHENTICATED','Session expired');
      const user = await User.findById(payload.sub);
      if (!user || !user.isActive) throw new ApiError(401,'UNAUTHENTICATED','Please log in');
      res.locals.user = user;
      res.locals.sessionId = payload.sid;
      next();
    } catch (error) { next(error); }
  };
}
export function requireRole(...allowed: Array<typeof roles[number]>): RequestHandler {
  return (_req,res,next) => res.locals.user && allowed.includes(res.locals.user.role) ? next() : next(new ApiError(403,'FORBIDDEN','Access denied'));
}
