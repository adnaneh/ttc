export async function GET() {
  const { env } = await import('../../../../../lib/env');
  const base = env.FUNCTIONS_URL;
  // In production, include the current Firebase Auth UID; demo uses a placeholder
  const url = `${base}/authGmailStart?userId=demo-user`;
  return Response.json({ url });
}
