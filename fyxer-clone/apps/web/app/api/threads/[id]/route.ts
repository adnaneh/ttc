export async function GET(_: Request, { params }: any) {
  const { id } = await params;
  // In production, proxy to Functions HTTPS endpoint that reads Firestore
  return Response.json({ id, subject: 'Hello', messages: [] });
}
