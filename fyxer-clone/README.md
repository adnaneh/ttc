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

