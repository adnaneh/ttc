import { KeyManagementServiceClient } from '@google-cloud/kms';
import { env } from '../env';

const kms = new KeyManagementServiceClient();

/**
 * Encrypt token JSON with Cloud KMS. Requires env.KMS_KEY_RESOURCE.
 * Set DEV_UNSAFE_TOKEN_CRYPTO=true to allow insecure base64 fallback (local dev only).
 */
export async function encryptToken(raw: string) {
  if (!env.KMS_KEY_RESOURCE) {
    if (process.env.DEV_UNSAFE_TOKEN_CRYPTO === 'true') {
      return Buffer.from(raw, 'utf8').toString('base64');
    }
    throw new Error('KMS_KEY_RESOURCE not set. Refusing to store tokens unencrypted.');
  }
  const [resp] = await kms.encrypt({
    name: env.KMS_KEY_RESOURCE,
    plaintext: Buffer.from(raw, 'utf8')
  });
  const ct = resp.ciphertext;
  if (!ct) throw new Error('KMS encrypt returned empty ciphertext');
  return Buffer.from(ct as Uint8Array).toString('base64');
}

export async function decryptToken(enc: string) {
  if (!env.KMS_KEY_RESOURCE) {
    if (process.env.DEV_UNSAFE_TOKEN_CRYPTO === 'true') {
      return Buffer.from(enc, 'base64').toString('utf8');
    }
    throw new Error('KMS_KEY_RESOURCE not set. Cannot decrypt tokens.');
  }
  const [resp] = await kms.decrypt({
    name: env.KMS_KEY_RESOURCE,
    ciphertext: Buffer.from(enc, 'base64')
  });
  const pt = resp.plaintext;
  if (!pt) throw new Error('KMS decrypt returned empty plaintext');
  return Buffer.from(pt as Uint8Array).toString('utf8');
}
