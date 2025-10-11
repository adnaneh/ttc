export async function getThread(userId: string, threadId: string) {
  // For demo, stub a structure; in prod, call Firebase callable/HTTPS endpoint to fetch
  return { threadId, subject: "Demo", snippet: "Hello", messages: [] };
}

export async function pineconeSearch(userId: string, query: string) {
  // Call your Functions HTTPS endpoint that wraps Pinecone query
  return [{ id: 'demo', score: 0.42, metadata: {} }];
}

export async function createDraft(userId: string, threadId: string, bodyHtml: string) {
  // Call Functions HTTPS endpoint to persist draft
  return { draftId: 'draft_demo', threadId, htmlBody: bodyHtml };
}

