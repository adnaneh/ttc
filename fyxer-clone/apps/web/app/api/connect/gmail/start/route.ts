export async function GET() {
  const base = process.env.NEXT_PUBLIC_FUNCTIONS_URL!;
  // In production, include the current Firebase Auth UID; demo uses a placeholder
  const url = `${base}/authGmailStart?userId=demo-user`;
  return Response.json({ url });
}

