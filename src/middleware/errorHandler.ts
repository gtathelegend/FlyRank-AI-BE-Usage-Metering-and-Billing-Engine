import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const status = err.status || 500;
  
  if (status === 429) {
    return res.status(429).json({
      error: 'quota_exceeded',
      message: err.message,
      details: err.details || null,
    });
  }

  if (status === 402) {
    return res.status(402).json({
      error: 'payment_required',
      message: err.message,
    });
  }

  if (status === 409) {
    return res.status(409).json({
      error: 'idempotency_conflict',
      message: err.message,
    });
  }

  if (status === 404) {
    return res.status(404).json({
      error: 'not_found',
      message: err.message,
    });
  }

  if (status === 400) {
    return res.status(400).json({
      error: 'bad_request',
      message: err.message,
    });
  }

  // Handle Stripe SDK specific errors gracefully
  if (err.type && (err.type.startsWith('Stripe') || err.name?.includes('Stripe'))) {
    return res.status(400).json({
      error: 'stripe_error',
      message: err.message,
      type: err.type,
    });
  }

  console.error('[Unhandled Internal Error]:', err);

  return res.status(500).json({
    error: 'internal_server_error',
    message: err.message || 'An unexpected internal error occurred. Please try again later.',
  });
}
