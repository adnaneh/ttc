import { onRequest } from 'firebase-functions/v2/https';
import { PubSub } from '@google-cloud/pubsub';

// Accepts Pub/Sub push and forwards payload to shared handler
export const gmailPushBridge = onRequest(async (req, res) => {
  try {
    const msg = (req.body && req.body.message) || undefined;
    if (!msg || !msg.data) { res.status(400).send('Missing message'); return; }

    // Pub/Sub push uses base64url; normalize before decoding
    const b64 = String(msg.data).replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as { emailAddress?: string; historyId?: string };

    if (!payload?.emailAddress || !payload?.historyId) { res.status(400).send('Invalid payload'); return; }

    if (!process.env.PUBSUB_EMULATOR_HOST) { res.status(500).send('Pub/Sub emulator not configured'); return; }

    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || (process.env.FIREBASE_CONFIG ? JSON.parse(String(process.env.FIREBASE_CONFIG)).projectId : undefined) || 'local';
    const pubsub = new PubSub({ projectId });
    const topic = pubsub.topic('gmail-watch');
    // Ensure the topic exists in the emulator; ignore already exists errors
    try { await topic.get({ autoCreate: true }); } catch (_) { /* ignore */ }
    await topic.publishMessage({ data: Buffer.from(JSON.stringify({ emailAddress: String(payload.emailAddress), historyId: String(payload.historyId) })) });
    // Ack immediately; emulator will trigger background function
    res.status(204).send();
    return;
  } catch (err) {
    // Non-2xx causes Pub/Sub to retry
    res.status(500).send();
  }
});
