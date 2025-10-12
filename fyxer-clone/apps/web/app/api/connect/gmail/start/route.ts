export async function GET() {
  const base = process.env.FUNCTIONS_URL || 'http://127.0.0.1:5001/demo-no-project/us-central1';
  // In production, include the current Firebase Auth UID; demo uses a placeholder
  const url = `${base}/authGmailStart?userId=demo-user`;
  return Response.json({ url });
}
