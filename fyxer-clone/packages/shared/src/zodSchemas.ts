import { z } from 'zod';

export const zEnvFunctions = z.object({
  // Core
  GCS_BUCKET_MAIL: z.string(),
  GMAIL_PUBSUB_TOPIC: z.string(),

  // Pinecone
  PINECONE_API_KEY: z.string(),
  PINECONE_INDEX_NAME: z.string().optional(),

  // Gmail OAuth
  GMAIL_CLIENT_ID: z.string(),
  GMAIL_CLIENT_SECRET: z.string(),
  GMAIL_REDIRECT_URI: z.string(),
  OAUTH_SUCCESS_REDIRECT: z.string().optional(),

  // Outlook OAuth & Webhook
  MS_CLIENT_ID: z.string(),
  MS_CLIENT_SECRET: z.string(),
  MS_TENANT: z.string(), // "common" or your tenant id
  MS_REDIRECT_URI: z.string(),
  GRAPH_WEBHOOK_URL: z.string(),

  // Models / telemetry
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),

  // Token encryption
  KMS_KEY_RESOURCE: z.string().optional()
});

export type EnvFunctions = z.infer<typeof zEnvFunctions>;
