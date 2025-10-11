import { Storage } from '@google-cloud/storage';
import { env } from '../env';
const storage = new Storage();
export const mailBucket = storage.bucket(env.GCS_BUCKET_MAIL);

export async function saveMailBodyPtr(path: string, data: Buffer | string) {
  const file = mailBucket.file(path);
  await file.save(typeof data === 'string' ? Buffer.from(data) : data, { resumable: false });
  return `gs://${env.GCS_BUCKET_MAIL}/${path}`;
}

