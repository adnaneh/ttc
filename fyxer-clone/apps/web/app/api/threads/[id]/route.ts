export async function GET(_: Request, { params }: any) {
  // In production, proxy to Functions HTTPS endpoint that reads Firestore
  return Response.json({ id: params.id, subject: 'Hello', messages: [] });
}
