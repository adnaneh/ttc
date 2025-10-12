export async function GET() {
  // Prefer env override; fall back to live Functions base in prod, emulator in dev
  const prodBase = 'https://europe-west1-the-trading-company-001.cloudfunctions.net';
  const devBase = 'http://127.0.0.1:5001/the-trading-company-001/europe-west1';
  const base = process.env.FUNCTIONS_URL || (process.env.NODE_ENV === 'production' ? prodBase : devBase);
  // In production, include the current Firebase Auth UID; demo uses a placeholder
  const url = `${base}/authGmailStart?userId=demo-user`;
  return Response.json({ url });
}
