import { logger as baseLogger } from 'firebase-functions';

// Simple log level gate for local/dev noise control.
// Use LOG_LEVEL (debug|info|warn|error|none). Defaults to 'info'.
const LEVELS: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40, none: 1000 };
const levelName = String(process.env.LOG_LEVEL || process.env.FUNCTIONS_LOG_LEVEL || 'info').toLowerCase();
const threshold = LEVELS[levelName] ?? LEVELS.info;

function allowed(level: keyof typeof LEVELS) {
  return LEVELS[level] >= threshold;
}

export const logger = {
  debug: (...args: any[]) => { if (allowed('debug')) (baseLogger as any).debug(...args); },
  info: (...args: any[]) => { if (allowed('info')) (baseLogger as any).info(...args); },
  warn: (...args: any[]) => { if (allowed('warn')) (baseLogger as any).warn(...args); },
  error: (...args: any[]) => { if (allowed('error')) (baseLogger as any).error(...args); },
};
