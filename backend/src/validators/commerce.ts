import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const selectionsSchema = z.array(z.object({group:z.string().min(1).max(80),options:z.array(z.string().min(1).max(80)).min(1).max(10)})).max(10).default([]);
export const addCartItemSchema = z.object({menuItemId:objectId,quantity:z.number().int().min(1).max(20).default(1),selections:selectionsSchema,specialInstructions:z.string().max(300).default('')}).strict();
export const patchCartItemSchema = z.object({quantity:z.number().int().min(0).max(20).optional(),specialInstructions:z.string().max(300).optional()}).strict().refine(value=>Object.keys(value).length>0);
export const couponCodeSchema = z.object({code:z.string().trim().toUpperCase().min(2).max(32)}).strict();
export const quoteSchema = z.object({code:z.string().trim().toUpperCase().max(32).optional(),addressId:objectId.optional()}).strict();
export const placeOrderSchema = z.object({addressId:objectId,code:z.string().trim().toUpperCase().max(32).optional(),deliveryInstructions:z.string().max(300).default(''),paymentMethod:z.literal('COD'),idempotencyKey:z.string().uuid()}).strict();
export const cancelOrderSchema = z.object({reason:z.string().trim().min(3).max(300)}).strict();
export const reorderSchema = z.object({replaceExisting:z.boolean().default(false)}).strict();
export const statusSchema = z.object({status:z.enum(['CONFIRMED','PREPARING','READY_FOR_PICKUP','PICKED_UP','ON_THE_WAY','DELIVERED','CANCELLED']),reason:z.string().trim().min(3).max(300).optional()}).strict();
export const assignPartnerSchema = z.object({partnerId:objectId}).strict();
