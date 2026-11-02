import { z } from 'zod';
const objectId=z.string().regex(/^[a-f\d]{24}$/i);
export const partnerSchema=z.object({userId:objectId,phone:z.string().regex(/^[6-9]\d{9}$/),vehicleType:z.enum(['BIKE','SCOOTER','CYCLE','CAR']),vehicleNumber:z.string().trim().min(3).max(30),isVerified:z.boolean().default(false)}).strict();
export const assignSchema=z.object({orderId:objectId,partnerId:objectId}).strict();
export const locationSchema=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).strict();
