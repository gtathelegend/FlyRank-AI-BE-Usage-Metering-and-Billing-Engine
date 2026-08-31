import express, { Express } from 'express';
import { generateRouter } from './routes/generate.router.js';
import { usageRouter } from './routes/usage.router.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Core Billing API Routes
  app.use('/generate', generateRouter);
  app.use('/usage', usageRouter);

  // Global Error Handler Middleware
  app.use(errorHandler);

  return app;
}
