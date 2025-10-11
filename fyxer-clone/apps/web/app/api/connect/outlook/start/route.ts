export async function GET() {
  const base = process.env.NEXT_PUBLIC_FUNCTIONS_URL!;
  const url = `${base}/authOutlookStart?userId=demo-user`;
  return Response.json({ url });
}

