import { Router } from 'express';
import type {
  ApiResponse,
  ScanCapabilities,
  ScanComparison,
  ScanJob,
  ScanJobStatus,
  ScanResult,
} from '../../../../../packages/contracts/api.js';
import type { AuthService } from '../auth/auth.service.js';
import {
  currentSession,
  requireAuth,
  requireCsrf,
} from '../auth/auth.middleware.js';
import type { JobsService } from './jobs.service.js';
import type { ArtifactStore } from './artifacts.js';

interface JobRow {
  id: string;
  urls: string;
  status: string;
  progress: number;
  error: string | null;
  result?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Stored JSON columns are parsed here so clients never handle encoded payloads.
function toJob(row: JobRow): ScanJob {
  return {
    id: row.id,
    urls: JSON.parse(row.urls) as string[],
    status: row.status as ScanJobStatus,
    progress: row.progress,
    error: row.error,
    result: row.result ? (JSON.parse(row.result) as ScanResult) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function jobsRouter(
  auth: AuthService,
  jobs: JobsService,
  artifacts?: ArtifactStore,
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(auth));
  router.get('/capabilities', (_req, res) => {
    const data: ScanCapabilities = {
      enabled: jobs.options.enabled,
      maxUrls: 3,
      hourlyLimit: jobs.options.hourlyLimit,
    };
    res.json({ data } satisfies ApiResponse<ScanCapabilities>);
  });
  router.get('/', async (_req, res) => {
    const rows = await jobs.list(currentSession(res).user.id);
    res.json({ data: rows.map(toJob) } satisfies ApiResponse<ScanJob[]>);
  });
  router.post('/', requireCsrf(auth), async (req, res) => {
    const job = await jobs.create(currentSession(res).user.id, req.body?.urls);
    res.status(201).json({ data: toJob(job) } satisfies ApiResponse<ScanJob>);
  });
  router.get('/compare/:before/:after', async (req, res) => {
    const comparison = await jobs.compare(
      currentSession(res).user.id,
      String(req.params['before']),
      String(req.params['after']),
      typeof req.query['url'] === 'string' ? req.query['url'] : '',
    );
    res.json({ data: comparison } satisfies ApiResponse<ScanComparison>);
  });
  // Ekran görüntüleri yalnızca tarama sahibine servis edilir.
  router.get('/artifacts/:artifactId', async (req, res) => {
    if (!artifacts) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Kaynak bulunamadı.',
          requestId: res.locals['requestId'],
        },
      });
      return;
    }
    const data = await artifacts.read(
      String(req.params['artifactId']),
      currentSession(res).user.id,
    );
    if (!data) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Görsel bulunamadı.',
          requestId: res.locals['requestId'],
        },
      });
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(data.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(data);
  });
  router.get('/:id/artifacts', async (req, res) => {
    const userId = currentSession(res).user.id;
    // Kayıt sahipliği doğrulanır; başka kullanıcının görselleri listelenmez.
    await jobs.get(userId, String(req.params['id']));
    const rows = artifacts
      ? await artifacts.list(String(req.params['id']), userId)
      : [];
    res.json({
      data: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        viewport: row.viewport,
        url: row.url,
        label: row.label ?? undefined,
        bytes: row.bytes,
      })),
    } satisfies ApiResponse<unknown[]>);
  });
  router.get('/:id', async (req, res) => {
    const job = await jobs.get(
      currentSession(res).user.id,
      String(req.params['id']),
    );
    res.json({ data: toJob(job) } satisfies ApiResponse<ScanJob>);
  });
  router.post('/:id/cancel', requireCsrf(auth), async (req, res) => {
    const job = await jobs.cancel(
      currentSession(res).user.id,
      String(req.params['id']),
    );
    res.json({ data: toJob(job) } satisfies ApiResponse<ScanJob>);
  });
  return router;
}
