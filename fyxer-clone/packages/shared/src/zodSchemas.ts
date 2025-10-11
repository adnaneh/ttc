import { z } from 'zod';
export const zEnvFunctions = z.object({
  GCS_BUCKET_MAIL: z.string(),
  GMAIL_PUBSUB_TOPIC: z.string(),
  PINECONE_API_KEY: z.string(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  KMS_KEY_RESOURCE: z.string().optional()
});

export type EnvFunctions = z.infer<typeof zEnvFunctions>;

