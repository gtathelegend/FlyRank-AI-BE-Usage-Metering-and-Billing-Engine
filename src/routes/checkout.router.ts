import { Router, Request, Response, NextFunction } from 'express';
import { StripeService } from '../services/stripe.service.js';

export const checkoutRouter = Router();

checkoutRouter.post('/session', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenant_id, success_url, cancel_url } = req.body || {};

    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing required body parameter: tenant_id',
      });
    }

    const result = await StripeService.createCheckoutSession(tenant_id, success_url, cancel_url);

    return res.status(200).json({
      status: 'success',
      data: {
        checkout_url: result.checkout_url,
        session_id: result.session_id,
      },
    });
  } catch (err) {
    next(err);
  }
});
