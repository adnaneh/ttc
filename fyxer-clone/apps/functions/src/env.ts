import { zEnvFunctions } from '@shared/zodSchemas';

export const env = zEnvFunctions.parse({
  GCS_BUCKET_MAIL: process.env.GCS_BUCKET_MAIL,
  GMAIL_PUBSUB_TOPIC: process.env.GMAIL_PUBSUB_TOPIC,
  PINECONE_API_KEY: process.env.PINECONE_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  SENTRY_DSN: process.env.SENTRY_DSN,
  KMS_KEY_RESOURCE: process.env.KMS_KEY_RESOURCE
});

