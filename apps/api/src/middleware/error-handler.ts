import type { ErrorRequestHandler } from 'express';
import type { ApiErrorResponse } from '../../../../packages/contracts/api.js';
import { AuthError } from '../modules/auth/auth.security.js';

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  _next,
) => {
  const incomingStatus =
    typeof error === 'object' && error !== null && 'status' in error
      ? error.status
      : undefined;
  const status =
    error instanceof AuthError
      ? error.status
      : incomingStatus === 400
        ? 400
        : incomingStatus === 413
          ? 413
          : 500;
  if (status === 500) {
    // Do not log request bodies, query strings, credentials, or raw error objects.
    console.error(
      JSON.stringify({
        event: 'request_failed',
        requestId: res.locals['requestId'],
        method: req.method,
      }),
    );
  }
  res.status(status).json({
    error: {
      code:
        error instanceof AuthError
          ? error.code
          : status === 400
            ? 'INVALID_REQUEST'
            : status === 413
              ? 'PAYLOAD_TOO_LARGE'
              : 'INTERNAL_ERROR',
      message:
        error instanceof AuthError
          ? error.message
          : status === 400
            ? 'Geçersiz istek.'
            : status === 413
              ? 'İstek boyutu sınırı aşıldı.'
              : 'Beklenmeyen bir hata oluştu.',
      requestId: res.locals['requestId'],
    },
  } satisfies ApiErrorResponse);
};
