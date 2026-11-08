import type { ApiResponse, Health } from '../../../../../packages/contracts/api.js';
import { Router } from 'express';

export const healthRouter = Router();
healthRouter.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const response: ApiResponse<Health> = { data: { status: 'ok', service: 'nabiz-api' } };
  res.json(response);
});
