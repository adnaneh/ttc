import { Storage } from '@google-cloud/storage';
import { env } from '../env';

const storage = new Storage();
export const mailBucket = storage.bucket(env.GCS_BUCKET_MAIL);

export async function saveMailBodyPtr(path: string, data: Buffer | string) {
  const file = mailBucket.file(path);
  await file.save(typeof data === 'string' ? Buffer.from(data) : data, { resumable: false, contentType: 'text/html; charset=utf-8' });
  return `gs://${env.GCS_BUCKET_MAIL}/${path}`;
}

export async function readByPtr(ptr: string): Promise<Buffer> {
  // ptr format: gs://bucket/path/to/file
  if (!ptr.startsWith('gs://')) throw new Error(`Invalid GCS pointer: ${ptr}`);
  const prefix = `gs://${env.GCS_BUCKET_MAIL}/`;
  const path = ptr.startsWith(prefix) ? ptr.slice(prefix.length) : ptr.replace(/^gs:\/\/[^/]+\//, '');
  const file = mailBucket.file(path);
  const [buf] = await file.download();
  return buf;
}
