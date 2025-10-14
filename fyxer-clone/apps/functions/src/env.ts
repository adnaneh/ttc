import { zEnvFunctions, type EnvFunctions } from '@shared/zodSchemas';

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
  KMS_KEY_RESOURCE: process.env.KMS_KEY_RESOURCE,

  HANA_HOST: process.env.HANA_HOST,
  HANA_PORT: process.env.HANA_PORT,
  HANA_USER: process.env.HANA_USER,
  HANA_PASSWORD: process.env.HANA_PASSWORD,
  HANA_SCHEMA: process.env.HANA_SCHEMA,
  HANA_INVOICES_VIEW: process.env.HANA_INVOICES_VIEW,

  HANA_SSL: process.env.HANA_SSL,
  HANA_SSL_VALIDATE: process.env.HANA_SSL_VALIDATE,

  INVOICE_NOTIFY_DEFAULT: process.env.INVOICE_NOTIFY_DEFAULT,
  AMOUNT_TOLERANCE: process.env.AMOUNT_TOLERANCE,

  // Dev-only toggles / emulator endpoints
  DEV_UNSAFE_TOKEN_CRYPTO: process.env.DEV_UNSAFE_TOKEN_CRYPTO,
  PUBSUB_EMULATOR_HOST: process.env.PUBSUB_EMULATOR_HOST,
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
  STORAGE_EMULATOR_HOST: process.env.STORAGE_EMULATOR_HOST,

  // Project id discovery in emulators
  GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  FIREBASE_CONFIG: process.env.FIREBASE_CONFIG
};

// Eager validation; throws if anything required is missing.
const parsed = zEnvFunctions.parse(raw);
export const env: EnvFunctions = parsed;
