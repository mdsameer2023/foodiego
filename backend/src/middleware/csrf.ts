import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { cookieOptions } from '../services/auth.js';

export function csrfIssuer(env: Env): RequestHandler {
  return (_req,res) => {
    const token = crypto.randomBytes(32).toString('base64url');
    res.cookie('fg_csrf',token,{...cookieOptions(env),httpOnly:false,path:'/',maxAge:24*60*60*1000});
    res.json({data:{csrfToken:token}});
  };
}
export function requireCsrf(env: Env): RequestHandler {
  return (req,_res,next) => {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && ![env.FRONTEND_URL,env.BACKEND_URL].includes(origin)) return next(new ApiError(403,'CSRF_REJECTED','Untrusted origin'));
    const cookie = req.cookies?.fg_csrf;
    const header = req.get('x-csrf-token');
    if (typeof cookie !== 'string' || typeof header !== 'string') return next(new ApiError(403,'CSRF_REJECTED','CSRF token required'));
    const a = Buffer.from(cookie); const b = Buffer.from(header);
    if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return next(new ApiError(403,'CSRF_REJECTED','Invalid CSRF token'));
    next();
  };
}
