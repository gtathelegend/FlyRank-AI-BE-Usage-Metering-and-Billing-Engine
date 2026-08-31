import express, { Express } from 'express';
import { generateRouter } from './routes/generate.router.js';
import { usageRouter } from './routes/usage.router.js';
import { checkoutRouter } from './routes/checkout.router.js';
import { webhookRouter } from './routes/webhook.router.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();

  // 1. Stripe Webhooks require exact raw body for cryptographic signature verification
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), webhookRouter);

  // 2. Standard JSON body parser for all other REST API endpoints
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Core Billing API Routes
  app.use('/checkout', checkoutRouter);
  app.use('/generate', generateRouter);
  app.use('/usage', usageRouter);

  // Global Error Handler Middleware
  app.use(errorHandler);

  return app;
}
