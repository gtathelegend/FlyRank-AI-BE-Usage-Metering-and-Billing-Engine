import { Router, Request, Response, NextFunction } from 'express';
import { UsageService } from '../services/usage.service.js';

export const usageRouter = Router();

usageRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenant_id as string;

    if (!tenantId) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing required query parameter: tenant_id',
      });
    }

    const report = await UsageService.getTenantUsage(tenantId);
    return res.status(200).json({
      status: 'success',
      data: report,
    });
  } catch (err) {
    next(err);
  }
});
