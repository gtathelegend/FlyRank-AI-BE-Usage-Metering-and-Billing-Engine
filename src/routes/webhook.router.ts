import { Router, Request, Response, NextFunction } from 'express';
import { StripeService, SignatureVerificationError } from '../services/stripe.service.js';

export const webhookRouter = Router();

webhookRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers['stripe-signature'] as string | undefined;

  try {
    const result = await StripeService.handleWebhookEvent(req.body, signature);
    return res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof SignatureVerificationError || err.status === 400) {
      return res.status(400).json({
        error: 'bad_request',
        message: err.message,
      });
    }
    console.error('[Stripe Webhook Processing Error]:', err);
    return res.status(500).json({
      error: 'internal_server_error',
      message: 'Failed to process webhook event. Stripe will retry.',
    });
  }
});
