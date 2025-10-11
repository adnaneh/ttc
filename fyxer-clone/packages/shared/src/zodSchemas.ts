import { z } from 'zod';

export const zEnvFunctions = z.object({
  // Core
  GCS_BUCKET_MAIL: z.string(),
  GMAIL_PUBSUB_TOPIC: z.string(),

  // Pinecone
  PINECONE_API_KEY: z.string(),
  PINECONE_INDEX_NAME: z.string().optional(), // defaults in code

  // Gmail OAuth (separate from Firebase Auth)
  GMAIL_CLIENT_ID: z.string(),
  GMAIL_CLIENT_SECRET: z.string(),
  GMAIL_REDIRECT_URI: z.string(), // points to your Cloud Function callback
  OAUTH_SUCCESS_REDIRECT: z.string().optional(), // where to send the user after connect

  // Models / telemetry (optional)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  KMS_KEY_RESOURCE: z.string().optional()
});

export type EnvFunctions = z.infer<typeof zEnvFunctions>;
