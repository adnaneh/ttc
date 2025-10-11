const GRAPH = 'https://graph.microsoft.com/v1.0';

function authHeaders(token: string, extra?: Record<string, string>) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(extra || {}) };
}

/**
 * Create an Outlook draft reply in the same conversation to a specific message.
 * 1) POST /me/messages/{id}/createReply  -> returns a draft
 * 2) PATCH /me/messages/{draftId}         -> set toRecipients, subject, body(HTML)
 */
export async function createOutlookDraftReply(params: {
  accessToken: string;
  replyToMessageId: string; // the message to reply to (from that conversation)
  to: string;
  subject: string;
  htmlBody: string; // we’ll set HTML only; Outlook clients can render it
}) {
  const { accessToken, replyToMessageId, to, subject, htmlBody } = params;

  // Step 1: create draft reply
  const createRes = await fetch(`${GRAPH}/me/messages/${replyToMessageId}/createReply`, {
    method: 'POST',
    headers: authHeaders(accessToken)
  });
  if (!createRes.ok) throw new Error(`createReply failed: ${createRes.status} ${await createRes.text()}`);
  const draft = await createRes.json() as { id: string };

  // Step 2: set recipients/subject/body
  const patchRes = await fetch(`${GRAPH}/me/messages/${draft.id}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      subject,
      toRecipients: [{ emailAddress: { address: to } }],
      body: { contentType: 'HTML', content: htmlBody }
    })
  });
  if (!patchRes.ok) throw new Error(`PATCH draft failed: ${patchRes.status} ${await patchRes.text()}`);

  return { draftId: draft.id };
}

