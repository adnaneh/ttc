import { z } from 'zod';

// Server-side env (available on Node during Next build/runtime)
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SENTRY_DSN: z.string().optional(),
  FUNCTIONS_URL: z.string().optional(),
});

// Client-exposed env (must be prefixed with NEXT_PUBLIC_*)
const clientSchema = z.object({
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

const _server = serverSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  SENTRY_DSN: process.env.SENTRY_DSN,
  FUNCTIONS_URL: process.env.FUNCTIONS_URL,
});

const _client = clientSchema.parse({
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

// Provide a sensible default for Functions base URL depending on environment.
const DEFAULT_FUNCTIONS_BASE_PROD = 'https://europe-west1-the-trading-company-001.cloudfunctions.net';
const DEFAULT_FUNCTIONS_BASE_DEV = 'http://127.0.0.1:5001/the-trading-company-001/europe-west1';
const FUNCTIONS_URL = _server.FUNCTIONS_URL ?? (_server.NODE_ENV === 'production' ? DEFAULT_FUNCTIONS_BASE_PROD : DEFAULT_FUNCTIONS_BASE_DEV);

export type WebEnvRuntime = {
  NODE_ENV: 'development' | 'test' | 'production';
  FUNCTIONS_URL: string;
  SENTRY_DSN?: string;
  NEXT_PUBLIC_POSTHOG_KEY?: string;
  NEXT_PUBLIC_SENTRY_DSN?: string;
};

export const env: WebEnvRuntime = {
  NODE_ENV: _server.NODE_ENV,
  SENTRY_DSN: _server.SENTRY_DSN,
  FUNCTIONS_URL,
  NEXT_PUBLIC_POSTHOG_KEY: _client.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_SENTRY_DSN: _client.NEXT_PUBLIC_SENTRY_DSN,
};
