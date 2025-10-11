import { zEnvFunctions } from '@shared/zodSchemas';

const raw = {
  GCS_BUCKET_MAIL: process.env.GCS_BUCKET_MAIL,
  GMAIL_PUBSUB_TOPIC: process.env.GMAIL_PUBSUB_TOPIC,

  PINECONE_API_KEY: process.env.PINECONE_API_KEY,
  PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME,

  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
  GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI,
  OAUTH_SUCCESS_REDIRECT: process.env.OAUTH_SUCCESS_REDIRECT,

  MS_CLIENT_ID: process.env.MS_CLIENT_ID,
  MS_CLIENT_SECRET: process.env.MS_CLIENT_SECRET,
  MS_TENANT: process.env.MS_TENANT,
  MS_REDIRECT_URI: process.env.MS_REDIRECT_URI,
  GRAPH_WEBHOOK_URL: process.env.GRAPH_WEBHOOK_URL,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  SENTRY_DSN: process.env.SENTRY_DSN,
  KMS_KEY_RESOURCE: process.env.KMS_KEY_RESOURCE
};

const parsed = zEnvFunctions.parse(raw);

export const env = {
  ...parsed,
  PINECONE_INDEX_NAME: parsed.PINECONE_INDEX_NAME ?? 'fyxer-prod'
};
