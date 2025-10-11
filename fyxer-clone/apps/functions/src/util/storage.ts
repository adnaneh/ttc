import { Storage } from '@google-cloud/storage';
import { env } from '../env';
import type { Readable } from 'node:stream';

const storage = new Storage();
export const mailBucket = storage.bucket(env.GCS_BUCKET_MAIL);

// For HTML message bodies (unchanged semantics, fixed content-type)
export async function saveMailBodyPtr(path: string, data: Buffer | string) {
  const file = mailBucket.file(path);
  await file.save(typeof data === 'string' ? Buffer.from(data) : data, {
    resumable: false,
    contentType: 'text/html; charset=utf-8'
  });
  return `gs://${env.GCS_BUCKET_MAIL}/${path}`;
}

// Save binary buffers (attachments) with resumable uploads
export async function saveBinaryPtr(path: string, data: Buffer, contentType?: string) {
  const file = mailBucket.file(path);
  await file.save(data, {
    resumable: true,
    contentType: contentType || 'application/octet-stream'
  });
  return `gs://${env.GCS_BUCKET_MAIL}/${path}`;
}

// Save a Node Readable stream to GCS with resumable upload
export async function saveToGCSStream(path: string, readable: Readable, contentType?: string) {
  const file = mailBucket.file(path);
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
  const file = mailBucket.file(rest);
  const [buf] = await file.download();
  return buf;
}
