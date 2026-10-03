import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

// Fields that must NEVER appear in logs
const REDACTED_PATHS = [
  'password',
  'passwordHash',
  'otp',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'authorization',
  'req.headers.authorization',
];

export function createLogger(name: string) {
  return pino({
    name,
    level: LOG_LEVEL,
    redact: {
      paths: REDACTED_PATHS,
      censor: '[REDACTED]',
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type Logger = ReturnType<typeof createLogger>;
