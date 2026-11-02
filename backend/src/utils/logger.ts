import pino from 'pino';
// Error objects from HTTP SDKs can contain request headers, keys and connection URIs.
export function safeLogError(error: unknown) {
  const value = error as {name?:unknown;code?:unknown;status?:unknown}|null;
  return {
    type: typeof value?.name==='string' && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(value.name) ? value.name : 'Error',
    code: typeof value?.code==='number' ? value.code : typeof value?.code==='string' && /^(?:E[A-Z_]{2,30}|[A-Z_]{3,30})$/.test(value.code) ? value.code : undefined,
    status: typeof value?.status==='number' ? value.status : undefined,
    message: 'Operation failed; raw error details omitted to protect credentials',
  };
}
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  serializers: {err:safeLogError},
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.x-csrf-token', 'res.headers.set-cookie', 'password', 'passwordHash', 'token', 'refreshToken', 'accessToken', 'resetToken'], censor: '[REDACTED]' },
});
