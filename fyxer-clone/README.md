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
   - Copy `apps/functions/.env.example` → `.env.local` (for emulator/dev) or set secrets via `firebase functions:secrets:set`
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

## Outlook/MS Graph setup
1. Create an app in Azure App Registrations (multitenant or single-tenant).
2. Add redirect URI: `https://REGION-PROJECT.cloudfunctions.net/authOutlookCallback`
3. API permissions (delegated): `offline_access`, `Mail.Read`, `Mail.ReadWrite`, `User.Read` (grant admin consent if required).
4. Put `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT`, `MS_REDIRECT_URI` in Functions secrets.
5. Set `GRAPH_WEBHOOK_URL` to your deployed `graphWebhook` HTTPS Function URL.
6. Deploy Functions, visit `/connect`, click **Connect Outlook**.

## KMS token encryption
- Create a KeyRing + CryptoKey (symmetric).
- Set `KMS_KEY_RESOURCE` to `projects/{project}/locations/{location}/keyRings/{ring}/cryptoKeys/{key}`.
- In prod, keep `DEV_UNSAFE_TOKEN_CRYPTO=false` so tokens are never stored unencrypted.
