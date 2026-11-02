import type { RequestHandler } from 'express';
import { disconnectSession } from '../services/realtime.js';
import type { Env } from '../config/env.js';
import { User } from '../models/User.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { registerSchema, loginSchema, forgotSchema, resetSchema } from '../validators/auth.js';
import { ApiError } from '../utils/errors.js';
import { clearAuthCookies, createSession, hashPassword, hashToken, publicUser, randomToken, rotateSession, verifyAccess, verifyPassword } from '../services/auth.js';
import { sendPasswordReset } from '../services/email.js';

export function authController(env: Env) {
  const register: RequestHandler = async (req,res) => {
    const input = registerSchema.parse(req.body);
    if (await User.exists({email:input.email})) throw new ApiError(409,'EMAIL_IN_USE','Email is already registered');
    const user = await User.create({name:input.name,email:input.email,phone:input.phone,passwordHash:await hashPassword(input.password),role:'CUSTOMER'});
    await createSession(res,env,user.id);
    res.status(201).json({data:{user:publicUser(user)}});
  };
  const login: RequestHandler = async (req,res) => {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({email:input.email}).select('+passwordHash');
    if (!user || !user.isActive || !(await verifyPassword(input.password,user.passwordHash))) throw new ApiError(401,'INVALID_CREDENTIALS','Invalid email or password');
    await createSession(res,env,user.id);
    res.json({data:{user:publicUser(user)}});
  };
  const logout: RequestHandler = async (req,res) => {
    const access = req.cookies?.fg_access;
    try {
      const payload = verifyAccess(access,env);
      await RefreshSession.deleteOne({sessionId:payload.sid,userId:payload.sub});
      disconnectSession(payload.sid);
    } catch {
      const refresh = req.cookies?.fg_refresh;
      if (typeof refresh === 'string') {const session=await RefreshSession.findOneAndDelete({tokenHash:hashToken(refresh,env.JWT_REFRESH_SECRET)});if(session)disconnectSession(session.sessionId);}
    }
    clearAuthCookies(res,env);
    res.json({data:{message:'Logged out'}});
  };
  const refresh: RequestHandler = async (req,res) => {
    const session = await rotateSession(res,env,req.cookies?.fg_refresh);
    const user = await User.findById(session.userId);
    if (!user || !user.isActive) { await RefreshSession.deleteOne({_id:session._id}); clearAuthCookies(res,env); throw new ApiError(401,'UNAUTHENTICATED','Please log in'); }
    res.json({data:{user:publicUser(user)}});
  };
  const me: RequestHandler = (_req,res) => { res.json({data:{user:publicUser(res.locals.user)}}); };
  const forgotPassword: RequestHandler = async (req,res) => {
    const {email} = forgotSchema.parse(req.body);
    if (env.EMAIL_MODE === 'disabled') throw new ApiError(503,'EMAIL_UNAVAILABLE','Password recovery is not configured');
    const user = await User.findOne({email,isActive:true});
    if (user) {
      await PasswordReset.deleteMany({userId:user._id});
      const token = randomToken();
      await PasswordReset.create({userId:user._id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+20*60*1000)});
      await sendPasswordReset(env,user.email,token);
    }
    res.json({data:{message:'If this email exists, reset instructions have been prepared'}});
  };
  const resetPassword: RequestHandler = async (req,res) => {
    const {token,password} = resetSchema.parse(req.body);
    const reset = await PasswordReset.findOneAndDelete({tokenHash:hashToken(token),expiresAt:{$gt:new Date()}});
    if (!reset) throw new ApiError(400,'INVALID_RESET_TOKEN','Reset link is invalid or expired');
    await User.updateOne({_id:reset.userId},{$set:{passwordHash:await hashPassword(password)}});
    await RefreshSession.deleteMany({userId:reset.userId});
    clearAuthCookies(res,env);
    res.json({data:{message:'Password updated. Please log in again'}});
  };
  return {register,login,logout,refresh,me,forgotPassword,resetPassword};
}
