export async function GET(_: Request, { params }: { params: { id: string }}) {
  // In production, proxy to Functions HTTPS endpoint that reads Firestore
  return Response.json({ id: params.id, subject: 'Hello', messages: [] });
}

