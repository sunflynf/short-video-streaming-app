import { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../common/auth-user.js';
import type { Env } from '../config/env.js';
import { REQUEST_ID_HEADER } from '../common/middleware/request-id.middleware.js';

type Req = IncomingMessage & { user?: AuthUser };

/** JSON logs in production (pretty in development), one line per request with ids attached. */
export function loggerParams(config: ConfigService<Env, true>): Params {
  const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
  return {
    pinoHttp: {
      level: config.get('LOG_LEVEL', { infer: true }),
      // Reuse the id set by requestIdMiddleware (echoed to the client as X-Request-Id).
      genReqId: (req) => (req.headers[REQUEST_ID_HEADER] as string | undefined) ?? randomUUID(),
      customProps: (req) => ({ userId: (req as Req).user?.id }),
      autoLogging: { ignore: (req) => req.url?.startsWith('/v1/health') ?? false },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["mux-signature"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
      serializers: {
        // Never log query strings: they may carry cursors or tokens.
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url.split('?')[0],
        }),
      },
      ...(isDev && { transport: { target: 'pino-pretty', options: { singleLine: true } } }),
    },
  };
}
