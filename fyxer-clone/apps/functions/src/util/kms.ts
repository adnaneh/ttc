// stub – wire to Cloud KMS as you harden
export async function encryptToken(raw: string) { return Buffer.from(raw, 'utf8').toString('base64'); }
export async function decryptToken(enc: string) { return Buffer.from(enc, 'base64').toString('utf8'); }

