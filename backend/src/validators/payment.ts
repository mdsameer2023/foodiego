import { z } from 'zod';

const objectId=z.string().regex(/^[a-f\d]{24}$/i);
export const startPaymentSchema=z.object({addressId:objectId,code:z.string().trim().toUpperCase().max(32).optional(),deliveryInstructions:z.string().max(300).default(''),idempotencyKey:z.string().uuid()}).strict();
export const verifyPaymentSchema=z.object({orderId:objectId,razorpayOrderId:z.string().min(5).max(100),razorpayPaymentId:z.string().min(5).max(100),razorpaySignature:z.string().regex(/^[a-f\d]{64}$/i)}).strict();
export const refundSchema=z.object({amountPaise:z.number().int().positive(),reason:z.string().trim().min(3).max(300),idempotencyKey:z.string().uuid()}).strict();
