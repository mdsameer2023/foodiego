import { z } from 'zod';
export const addressSchema = z.object({
  fullName:z.string().trim().min(2).max(80),
  phone:z.string().regex(/^[6-9]\d{9}$/),
  addressLine1:z.string().trim().min(5).max(160),
  addressLine2:z.string().trim().max(160).default(''),
  landmark:z.string().trim().max(120).default(''),
  city:z.string().trim().min(2).max(80),
  state:z.string().trim().min(2).max(80),
  postalCode:z.string().regex(/^\d{6}$/),
  latitude:z.number().min(-90).max(90).optional(),
  longitude:z.number().min(-180).max(180).optional(),
  addressType:z.enum(['HOME','WORK','OTHER']).default('HOME'),
  isDefault:z.boolean().default(false),
}).strict();
export const addressPatchSchema = addressSchema.partial().refine(value=>Object.keys(value).length>0);
