import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { logger } from './logger.js';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const notFound: RequestHandler = (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Resource not found'));
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  void _next;
  if(typeof error==='object'&&error!==null&&'type'in error&&error.type==='entity.too.large'){res.status(413).json({error:{code:'PAYLOAD_TOO_LARGE',message:'Request body is too large'}});return;}
  if(error instanceof SyntaxError&&'body'in error){res.status(400).json({error:{code:'INVALID_JSON',message:'Request body must be valid JSON'}});return;}
  if (error instanceof ApiError) { res.status(error.status).json({error:{code:error.code,message:error.message}}); return; }
  if (error instanceof ZodError) { res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Invalid request',issues:error.issues.map(i=>({path:i.path.join('.'),message:i.message}))}}); return; }
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) { res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Invalid request'}}); return; }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) { res.status(409).json({error:{code:'CONFLICT',message:'A record already exists'}}); return; }
  logger.error({err:error}, 'request failed');
  res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Something went wrong'}});
};
