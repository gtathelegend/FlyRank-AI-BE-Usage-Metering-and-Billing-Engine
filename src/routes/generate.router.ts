import { Router, Request, Response, NextFunction } from 'express';
import { MeterService } from '../services/meter.service.js';

export const generateRouter = Router();

generateRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idempotencyKey = req.header('Idempotency-Key');

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing or invalid required header: Idempotency-Key',
      });
    }

    const {
      tenant_id,
      input_tokens = 0,
      cached_input_tokens = 0,
      output_tokens = 0,
      reasoning_tokens = 0,
      prompt,
    } = req.body || {};

    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing required body parameter: tenant_id',
      });
    }

    // Input validation for negative token numbers
    if (
      typeof input_tokens !== 'number' || input_tokens < 0 ||
      typeof cached_input_tokens !== 'number' || cached_input_tokens < 0 ||
      typeof output_tokens !== 'number' || output_tokens < 0 ||
      typeof reasoning_tokens !== 'number' || reasoning_tokens < 0
    ) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Token amounts must be non-negative numbers',
      });
    }

    // Record usage via MeterService (handles quota check & idempotency)
    const result = await MeterService.recordUsage({
      tenant_id,
      usage_type: 'ai_token',
      idempotency_key: idempotencyKey,
      token_breakdown: {
        input_tokens,
        cached_input_tokens,
        output_tokens,
        reasoning_tokens,
      },
      metadata: {
        endpoint: '/generate',
        prompt_snippet: prompt ? String(prompt).substring(0, 50) : undefined,
      },
    });

    return res.status(200).json({
      status: 'success',
      data: {
        completion: `Simulated AI completion for prompt: "${prompt || 'Default Prompt'}"`,
        tenant_id: result.tenant_id,
        replayed: result.replayed,
        usage: {
          type: 'ai_tokens',
          total_billable_tokens: result.quantity,
          input_tokens: result.input_tokens,
          cached_input_tokens: result.cached_input_tokens,
          output_tokens: result.output_tokens,
          reasoning_tokens: result.reasoning_tokens,
        },
        cost: {
          microcents: result.cost_microcents,
          cents: result.cost_cents,
          formatted: result.formatted_usd,
          currency: 'usd',
        },
        idempotency_key: result.idempotency_key,
        created_at: result.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});
