import { Storage } from '@google-cloud/storage';
import type { Readable } from 'node:stream';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

function getMailBucket() {
  const name = String(process.env.GCS_BUCKET_MAIL || '');
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
  return `gs://${process.env.GCS_BUCKET_MAIL}/${path}`;
}

// Save binary buffers (attachments) with resumable uploads
export async function saveBinaryPtr(path: string, data: Buffer, contentType?: string) {
  const file = getMailBucket().file(path);
  await file.save(data, {
    resumable: true,
    contentType: contentType || 'application/octet-stream'
  });
  return `gs://${process.env.GCS_BUCKET_MAIL}/${path}`;
}

// Save plaintext with correct content-type
export async function saveTextPtr(path: string, data: Buffer | string) {
  const file = getMailBucket().file(path);
  await file.save(typeof data === 'string' ? Buffer.from(data) : data, {
    resumable: false,
    contentType: 'text/plain; charset=utf-8'
  });
  return `gs://${process.env.GCS_BUCKET_MAIL}/${path}`;
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
  return `gs://${process.env.GCS_BUCKET_MAIL}/${path}`;
}

export async function readByPtr(ptr: string): Promise<Buffer> {
  if (!ptr) throw new Error('Invalid pointer');
  if (ptr.startsWith('gs://')) {
    const parts = ptr.replace('gs://', '').split('/');
    const bucket = parts.shift()!;
    const p = parts.join('/');
    const storage = new Storage();
    const file = storage.bucket(bucket).file(p);
    const [buf] = await file.download();
    return buf;
  }
  if (ptr.startsWith('file://')) {
    return await fsp.readFile(new URL(ptr));
  }
  // treat as local path (absolute or relative)
  const abs = path.isAbsolute(ptr) ? ptr : path.resolve(process.cwd(), ptr);
  return await fsp.readFile(abs);
}

// Read only the first N bytes from a GCS object referenced by ptr.
// Useful to avoid loading very large blobs when only a preview is needed.
export async function readPartialByPtr(ptr: string, maxBytes: number): Promise<Buffer> {
  if (maxBytes <= 0) return Buffer.alloc(0);
  if (ptr.startsWith('gs://')) {
    const parts = ptr.replace('gs://', '').split('/');
    const bucket = parts.shift()!;
    const p = parts.join('/');
    const storage = new Storage();
    const file = storage.bucket(bucket).file(p);
    const [buf] = await file.download({ start: 0, end: Math.max(0, maxBytes - 1) });
    return buf;
  }
  const full = await readByPtr(ptr);
  return full.subarray(0, Math.min(full.length, maxBytes));
}

// Create a read stream for a GCS object by gs:// pointer.
export function streamByPtr(ptr: string) {
  if (ptr.startsWith('gs://')) {
    const parts = ptr.replace('gs://', '').split('/');
    const bucket = parts.shift()!;
    const p = parts.join('/');
    const storage = new Storage();
    const file = storage.bucket(bucket).file(p);
    return file.createReadStream({ validation: false });
  }
  if (ptr.startsWith('file://')) {
    return fs.createReadStream(new URL(ptr));
  }
  const abs = path.isAbsolute(ptr) ? ptr : path.resolve(process.cwd(), ptr);
  return fs.createReadStream(abs);
}
