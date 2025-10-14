export async function GET() {
  const { env } = await import('../../../../../lib/env');
  const base = env.FUNCTIONS_URL;
  const url = `${base}/authOutlookStart?userId=demo-user`;
  return Response.json({ url });
}
