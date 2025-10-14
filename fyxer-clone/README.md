# Fyxer-style AI Inbox & Meeting Assistant (Firebase + Vercel Agents)

## Prereqs
- Node 20+, Firebase CLI, GCP project, Vercel project, Pinecone index (`fyxer-prod`), PostHog project, Sentry DSN (optional)

## Bootstrap
1. `npm i` (root installs all workspaces)
2. **Firebase setup**
   - Set default project: `firebase use REPLACE_ME`
   - Create Pub/Sub topics: `gmail-watch`, `mail.ingest`, `mail.normalize`, `mail.embed`, `mail.index`
   - Create a GCS bucket for mail bodies (set `GCS_BUCKET_MAIL`)
   - `firebase deploy --only firestore:indexes,firestore:rules,storage`
3. **Functions env**
   - Copy `apps/functions/.env.example` → `apps/functions/.env.local` for local/emulator.
   - The Emulator auto-loads `.env` and `.env.local` — no code changes needed.
   - For prod, set runtime environment variables (not Secrets) in Cloud Functions/Run using values from `apps/functions/.env.local`. See “Prod env” below.
   - `npm -w apps/functions run build` then `firebase emulators:start`
4. **Web app**
   - Copy `apps/web/.env.example` → `.env.local` and set `NEXT_PUBLIC_POSTHOG_KEY`, provider API keys (server runtime)
   - `npm -w apps/web run dev`
5. **Vercel**
   - Link `apps/web` to your Vercel project
   - Add env vars (OpenAI/Anthropic/Gemini keys) in Vercel project settings
6. **Pinecone**
   - Create index `fyxer-prod` (or update `util/pinecone.ts`)
7. **Next steps**
   - Wire Gmail OAuth + `users.watch` after connect
   - Wire Graph subscriptions (`/webhooks/graph`), set HTTPS trigger URL in Azure app
   - Replace embedding stub with your provider (OpenAI text-embedding, etc.)

## SAP HANA invoice flow
- Set Functions runtime env for HANA connectivity: `HANA_HOST`, `HANA_PORT`, `HANA_USER`, `HANA_PASSWORD`, `HANA_SCHEMA`, `HANA_INVOICES_VIEW` (defaults to `INVOICES`), and SSL flags if needed.
- Add Pub/Sub topic: `invoice.process`.
- When a Gmail/Outlook message with an invoice attachment (PDF or common image like PNG/JPEG) arrives, the system stores the file in GCS, extracts fields (PDF: regex + optional LLM; images: vision LLM requires `OPENAI_API_KEY`), looks up the invoice in HANA, and if any incoherence is found, drafts a reply in the thread to `INVOICE_NOTIFY_DEFAULT` (defaults to `maria.ttc@gmail.com`).
- When the user sends that draft, the next Gmail push parses the corrections from the message and applies them to HANA with prepared statements.

## Outlook/MS Graph setup
1. Create an app in Azure App Registrations (multitenant or single-tenant).
2. Add redirect URI: `https://REGION-PROJECT.cloudfunctions.net/authOutlookCallback`
3. API permissions (delegated): `offline_access`, `Mail.Read`, `Mail.ReadWrite`, `User.Read` (grant admin consent if required).
4. Put `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT`, `MS_REDIRECT_URI` in Functions runtime environment variables.
5. Set `GRAPH_WEBHOOK_URL` to your deployed `graphWebhook` HTTPS Function URL.
6. Deploy Functions, visit `/connect`, click **Connect Outlook**.

## KMS token encryption
- Create a KeyRing + CryptoKey (symmetric).
- Set `KMS_KEY_RESOURCE` to `projects/{project}/locations/{location}/keyRings/{ring}/cryptoKeys/{key}`.
- In prod, keep `DEV_UNSAFE_TOKEN_CRYPTO=false` so tokens are never stored unencrypted.

## Prod env
- Where to view/edit:
  - Cloud Console → Cloud Run → select a function service → “Variables & Secrets”.
  - Or Cloud Console → Cloud Functions → select function → “Variables & Secrets”.
- Recommended variables to set as plain env vars:
  - `OPENAI_API_KEY`, `PINECONE_API_KEY`
  - `GMAIL_CLIENT_SECRET`, `MS_CLIENT_SECRET`
  - `KMS_KEY_RESOURCE`
  - `HANA_*` keys
- Seed from repo files:
  - Use `apps/functions/.env.local` during local dev; copy needed values into Cloud Run env vars for prod.
- Optional automation:
  - Run `apps/functions/scripts/push_env_to_cloud_run.sh --region europe-west1 --project <projectId>` to push values to all function services.
  - Note: If services currently use Secrets, the script tries to replace them with env vars. If it errors, use the Console to remove Secrets and add env vars in a single edit/deploy.
