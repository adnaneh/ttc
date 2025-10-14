import { z } from 'zod';

export const zEnvFunctions = z.object({
  // Core
  GCS_BUCKET_MAIL: z.string(),
  GMAIL_PUBSUB_TOPIC: z.string(),

  PINECONE_API_KEY: z.string(),
  PINECONE_INDEX_NAME: z.string().default('fyxer-prod'),

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
  OPENAI_API_KEY: z.string(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),

  // Token encryption
  KMS_KEY_RESOURCE: z.string().optional(),
  DEV_UNSAFE_TOKEN_CRYPTO: z.coerce.boolean().default(false),

  // ----- SAP HANA -----
  HANA_HOST: z.string().optional(),
  HANA_PORT: z.coerce.number().optional(),
  HANA_USER: z.string().optional(),
  HANA_PASSWORD: z.string().optional(),
  HANA_SCHEMA: z.string().optional(),
  HANA_INVOICES_VIEW: z.string().default('INVOICES'),
  HANA_SSL: z.coerce.boolean().optional(),
  HANA_SSL_VALIDATE: z.coerce.boolean().optional(),

  // ----- Incoherence flow -----
  INVOICE_NOTIFY_DEFAULT: z.string().default('maria.ttc@gmail.com'),
  AMOUNT_TOLERANCE: z.coerce.number().default(0.01)
}).extend({
  // Emulator endpoints (optional)
  PUBSUB_EMULATOR_HOST: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  STORAGE_EMULATOR_HOST: z.string().optional(),

  // Project id discovery / config blobs (optional)
  GCLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  FIREBASE_CONFIG: z.string().optional()
});

export type EnvFunctions = z.infer<typeof zEnvFunctions>;
