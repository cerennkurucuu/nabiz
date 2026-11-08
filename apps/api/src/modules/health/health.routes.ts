import { Router } from 'express';

export const healthRouter = Router();
healthRouter.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: { status: 'ok', service: 'nabiz-api' } });
});
