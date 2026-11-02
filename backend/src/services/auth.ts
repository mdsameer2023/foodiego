import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { Response } from 'express';
import type { Env } from '../config/env.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { ApiError } from '../utils/errors.js';

const ACCESS_MS = 15 * 60 * 1000;
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
export const randomToken = () => crypto.randomBytes(48).toString('base64url');
export const hashToken = (value: string, secret?: string) => secret ? crypto.createHmac('sha256',secret).update(value).digest('hex') : crypto.createHash('sha256').update(value).digest('hex');
export const hashPassword = (value: string) => bcrypt.hash(value, 12);
export const verifyPassword = (value: string, hash: string) => bcrypt.compare(value, hash);
export function cookieOptions(env: Env) {
  const crossSite = new URL(env.FRONTEND_URL).hostname !== new URL(env.BACKEND_URL).hostname;
  return { httpOnly: true as const, secure: env.NODE_ENV === 'production' || crossSite, sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax', path: '/api' };
}
export function publicUser(user: {id?: string; _id?: unknown; name:string; email:string; phone?:string|null; avatar?:string|null; role:string; isEmailVerified:boolean; createdAt?:Date; updatedAt?:Date}) {
  return { id: user.id ?? String(user._id), name:user.name, email:user.email, phone:user.phone ?? null, avatar:user.avatar ?? null, role:user.role, isEmailVerified:user.isEmailVerified, createdAt:user.createdAt, updatedAt:user.updatedAt };
}
function setAuthCookies(res: Response, env: Env, userId: string, sessionId: string, refreshToken: string) {
  const accessToken = jwt.sign({sub:userId,sid:sessionId}, env.JWT_ACCESS_SECRET, {algorithm:'HS256',expiresIn:'15m',issuer:'foodiego'});
  const options = cookieOptions(env);
  res.cookie('fg_access',accessToken,{...options,maxAge:ACCESS_MS});
  res.cookie('fg_refresh',refreshToken,{...options,path:'/api/auth',maxAge:REFRESH_MS});
}
export async function createSession(res: Response, env: Env, userId: string) {
  const sessionId = crypto.randomUUID();
  const refreshToken = randomToken();
  await RefreshSession.create({userId,sessionId,tokenHash:hashToken(refreshToken,env.JWT_REFRESH_SECRET),expiresAt:new Date(Date.now()+REFRESH_MS)});
  setAuthCookies(res,env,userId,sessionId,refreshToken);
}
export async function rotateSession(res: Response, env: Env, refreshToken: string | undefined) {
  if (!refreshToken) throw new ApiError(401,'UNAUTHENTICATED','Please log in');
  const nextToken = randomToken();
  const session = await RefreshSession.findOneAndUpdate({tokenHash:hashToken(refreshToken,env.JWT_REFRESH_SECRET),expiresAt:{$gt:new Date()}},{$set:{tokenHash:hashToken(nextToken,env.JWT_REFRESH_SECRET),expiresAt:new Date(Date.now()+REFRESH_MS)}},{new:true});
  if (!session) throw new ApiError(401,'UNAUTHENTICATED','Session expired');
  setAuthCookies(res,env,String(session.userId),session.sessionId,nextToken);
  return session;
}
export function verifyAccess(token: string | undefined, env: Env): JwtPayload {
  if (!token) throw new ApiError(401,'UNAUTHENTICATED','Please log in');
  try {
    const payload = jwt.verify(token,env.JWT_ACCESS_SECRET,{algorithms:['HS256'],issuer:'foodiego'});
    if (typeof payload === 'string' || !payload.sub || typeof payload.sid !== 'string') throw new Error('Invalid token');
    return payload;
  } catch { throw new ApiError(401,'UNAUTHENTICATED','Please log in again'); }
}
export function clearAuthCookies(res: Response, env: Env) {
  const options = cookieOptions(env);
  res.clearCookie('fg_access',options);
  res.clearCookie('fg_refresh',{...options,path:'/api/auth'});
}
