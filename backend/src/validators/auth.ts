import { z } from 'zod';
export const email = z.email().max(254).transform(value=>value.trim().toLowerCase());
export const password = z.string().min(8).max(128);
export const registerSchema = z.object({name:z.string().trim().min(2).max(80),email,password,phone:z.string().regex(/^[6-9]\d{9}$/).optional()}).strict();
export const loginSchema = z.object({email,password:z.string().min(1)}).strict();
export const forgotSchema = z.object({email}).strict();
export const resetSchema = z.object({token:z.string().min(30),password}).strict();
export const changePasswordSchema = z.object({currentPassword:z.string().min(1),newPassword:password}).strict();
export const profileSchema = z.object({name:z.string().trim().min(2).max(80).optional(),phone:z.union([z.string().regex(/^[6-9]\d{9}$/),z.null()]).optional(),avatar:z.union([z.url().refine(value=>value.startsWith('https://')),z.null()]).optional()}).strict().refine(value=>Object.keys(value).length>0);
