import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { healthRouter } from './modules/health/health.routes.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((_req, res, next) => {
    res.locals['requestId'] = randomUUID();
    res.setHeader('X-Request-Id', res.locals['requestId']);
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use('/api/health', healthRouter);
  app.use((_req, res) => {
    res.status(404).json({ error: {
      code: 'NOT_FOUND', message: 'Kaynak bulunamadı.', requestId: res.locals['requestId']
    } });
  });
  app.use(errorHandler);
  return app;
}
