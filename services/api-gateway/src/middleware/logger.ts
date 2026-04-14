import pinoHttp from 'pino-http';
import type { HttpLogger, Options } from 'pino-http';
import pino from 'pino';
import type { IncomingMessage } from 'node:http';

export interface LoggerConfig {
  level: string;
  destination?: pino.DestinationStream;
}

export function buildLogger(cfg: LoggerConfig): pino.Logger {
  return pino(
    {
      level: cfg.level,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.accessToken',
        ],
        remove: true,
      },
    },
    cfg.destination ?? pino.destination({ sync: false }),
  );
}

export function buildHttpLogger(logger: pino.Logger): HttpLogger {
  const options: Options = {
    logger,
    genReqId: (req) => {
      const withId = req as IncomingMessage & { requestId?: string };
      return withId.requestId ?? 'unknown';
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: () => 'request completed',
    customErrorMessage: () => 'request errored',
  };
  return pinoHttp(options);
}
