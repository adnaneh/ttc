import { Storage } from '@google-cloud/storage';
import { env } from '../env';
import type { Readable } from 'node:stream';

function getMailBucket() {
  const name = String(env.GCS_BUCKET_MAIL || '');
  if (!name) throw new Error('GCS_BUCKET_MAIL is required');
  const storage = new Storage();
  return storage.bucket(name);
}

// For HTML message bodies (unchanged semantics, fixed content-type)
export async function saveMailBodyPtr(path: string, data: Buffer | string) {
  const file = getMailBucket().file(path);
  await file.save(typeof data === 'string' ? Buffer.from(data) : data, {
    resumable: false,
    contentType: 'text/html; charset=utf-8'
  });
  return `gs://${env.GCS_BUCKET_MAIL}/${path}`;
}

// Save binary buffers (attachments) with resumable uploads
export async function saveBinaryPtr(path: string, data: Buffer, contentType?: string) {
  const file = getMailBucket().file(path);
  await file.save(data, {
    resumable: true,
    contentType: contentType || 'application/octet-stream'
  });
  return `gs://${env.GCS_BUCKET_MAIL}/${path}`;
}

// Save plaintext with correct content-type
export async function saveTextPtr(path: string, data: Buffer | string) {
  const file = getMailBucket().file(path);
  await file.save(typeof data === 'string' ? Buffer.from(data) : data, {
    resumable: false,
    contentType: 'text/plain; charset=utf-8'
  });
  return `gs://${env.GCS_BUCKET_MAIL}/${path}`;
}

// Save a Node Readable stream to GCS with resumable upload
export async function saveToGCSStream(path: string, readable: Readable, contentType?: string) {
  const file = getMailBucket().file(path);
  await new Promise<void>((resolve, reject) => {
    const ws = file.createWriteStream({
      resumable: true,
      contentType: contentType || 'application/octet-stream'
    });
    readable.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
  return `gs://${env.GCS_BUCKET_MAIL}/${path}`;
}

export async function readByPtr(ptr: string): Promise<Buffer> {
  // ptr format: gs://bucket/path/to/file
  if (!ptr.startsWith('gs://')) throw new Error(`Invalid GCS pointer: ${ptr}`);
  const prefix = `gs://${env.GCS_BUCKET_MAIL}/`;
  if (!ptr.startsWith(prefix)) {
    throw new Error(`Unexpected bucket in ptr: ${ptr}`);
  }
  const rest = ptr.slice(prefix.length);
  const file = getMailBucket().file(rest);
  const [buf] = await file.download();
  return buf;
}

// Read only the first N bytes from a GCS object referenced by ptr.
// Useful to avoid loading very large blobs when only a preview is needed.
export async function readPartialByPtr(ptr: string, maxBytes: number): Promise<Buffer> {
  if (maxBytes <= 0) return Buffer.alloc(0);
  if (!ptr.startsWith('gs://')) throw new Error(`Invalid GCS pointer: ${ptr}`);
  const prefix = `gs://${env.GCS_BUCKET_MAIL}/`;
  if (!ptr.startsWith(prefix)) {
    throw new Error(`Unexpected bucket in ptr: ${ptr}`);
  }
  const rest = ptr.slice(prefix.length);
  const file = getMailBucket().file(rest);
  // Range is inclusive; request [0, maxBytes-1]
  const [buf] = await file.download({ start: 0, end: Math.max(0, maxBytes - 1) });
  return buf;
}

// Create a read stream for a GCS object by gs:// pointer.
export function streamByPtr(ptr: string) {
  if (!ptr.startsWith('gs://')) throw new Error(`Invalid GCS pointer: ${ptr}`);
  const prefix = `gs://${env.GCS_BUCKET_MAIL}/`;
  if (!ptr.startsWith(prefix)) {
    throw new Error(`Unexpected bucket in ptr: ${ptr}`);
  }
  const rest = ptr.slice(prefix.length);
  const file = getMailBucket().file(rest);
  return file.createReadStream({ validation: false });
}
