import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { healthRouter } from './modules/health/health.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import type { ApiErrorResponse } from '../../../packages/contracts/api.js';
import type { AuthService } from './modules/auth/auth.service.js';
import { authRouter } from './modules/auth/auth.routes.js';
import type { JobsService } from './modules/scanning/jobs.service.js';
import type { ArtifactStore } from './modules/scanning/artifacts.js';
import { jobsRouter } from './modules/scanning/jobs.routes.js';

export function createApp(
  auth?: AuthService,
  jobs?: JobsService,
  artifacts?: ArtifactStore,
) {
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
  app.use('/health', healthRouter);
  if (auth) app.use('/api/auth', authRouter(auth));
  if (auth && jobs) app.use('/api/scans', jobsRouter(auth, jobs, artifacts));
  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Kaynak bulunamadı.',
        requestId: res.locals['requestId'],
      },
    } satisfies ApiErrorResponse);
  });
  app.use(errorHandler);
  return app;
}
