"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zEnvFunctions = void 0;
const zod_1 = require("zod");
exports.zEnvFunctions = zod_1.z.object({
    // Core
    GCS_BUCKET_MAIL: zod_1.z.string(),
    GMAIL_PUBSUB_TOPIC: zod_1.z.string(),
    // Pinecone
    PINECONE_API_KEY: zod_1.z.string(),
    PINECONE_INDEX_NAME: zod_1.z.string().optional(),
    // Gmail OAuth
    GMAIL_CLIENT_ID: zod_1.z.string(),
    GMAIL_CLIENT_SECRET: zod_1.z.string(),
    GMAIL_REDIRECT_URI: zod_1.z.string(),
    OAUTH_SUCCESS_REDIRECT: zod_1.z.string().optional(),
    // Outlook OAuth & Webhook
    MS_CLIENT_ID: zod_1.z.string(),
    MS_CLIENT_SECRET: zod_1.z.string(),
    MS_TENANT: zod_1.z.string(), // "common" or your tenant id
    MS_REDIRECT_URI: zod_1.z.string(),
    GRAPH_WEBHOOK_URL: zod_1.z.string(),
    // Models / telemetry
    OPENAI_API_KEY: zod_1.z.string().optional(),
    ANTHROPIC_API_KEY: zod_1.z.string().optional(),
    GEMINI_API_KEY: zod_1.z.string().optional(),
    SENTRY_DSN: zod_1.z.string().optional(),
    // Token encryption
    KMS_KEY_RESOURCE: zod_1.z.string().optional(),
    // ----- SAP HANA -----
    HANA_HOST: zod_1.z.string().optional(),
    HANA_PORT: zod_1.z.string().optional(),
    HANA_USER: zod_1.z.string().optional(),
    HANA_PASSWORD: zod_1.z.string().optional(),
    HANA_SCHEMA: zod_1.z.string().optional(),
    HANA_INVOICES_VIEW: zod_1.z.string().optional(),
    HANA_SSL: zod_1.z.string().optional(),
    HANA_SSL_VALIDATE: zod_1.z.string().optional(),
    // ----- Incoherence flow -----
    INVOICE_NOTIFY_DEFAULT: zod_1.z.string().optional(),
    AMOUNT_TOLERANCE: zod_1.z.string().optional()
});
