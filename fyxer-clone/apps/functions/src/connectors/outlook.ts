const GRAPH = 'https://graph.microsoft.com/v1.0';

function authHeaders(token: string, extra?: Record<string, string>) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(extra || {}) };
}

export async function getMeProfile(token: string) {
  const res = await fetch(`${GRAPH}/me`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Graph /me failed: ${res.status}`);
  return res.json() as Promise<{ id: string; userPrincipalName: string; mail?: string }>;
}

export async function createSubscription(token: string, notificationUrl: string, expirationISO: string, folder: 'Inbox'|'SentItems' = 'Inbox') {
  const res = await fetch(`${GRAPH}/subscriptions`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      changeType: "created,updated",
      resource: `me/mailFolders('${folder}')/messages`,
      notificationUrl,
      expirationDateTime: expirationISO,
      clientState: "ok"
    })
  });
  if (!res.ok) throw new Error(`Graph subscription failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ id: string; expirationDateTime: string }>;
}

export async function renewSubscription(token: string, subscriptionId: string, expirationISO: string) {
  const res = await fetch(`${GRAPH}/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ expirationDateTime: expirationISO })
  });
  if (!res.ok) throw new Error(`Renew subscription failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ id: string; expirationDateTime: string }>;
}

export async function getMessage(token: string, id: string) {
  const url = `${GRAPH}/me/messages/${id}?$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,body`;
  const res = await fetch(url, { headers: authHeaders(token, { Prefer: 'outlook.body-content-type="html"' }) });
  if (!res.ok) throw new Error(`Get message failed: ${res.status}`);
  return res.json() as Promise<any>;
}

export async function getMessageWithAttachments(token: string, id: string) {
  const url = `${GRAPH}/me/messages/${id}?$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,body`+
            `&$expand=attachments($select=id,name,contentType,size,contentBytes,isInline)`;
  const res = await fetch(url, { headers: authHeaders(token, { Prefer: 'outlook.body-content-type="html"' }) });
  if (!res.ok) throw new Error(`Get message+attachments failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<any>;
}

type DeltaResp = { value: any[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string };

export async function messagesDelta(token: string, link?: string, folder: 'Inbox'|'SentItems' = 'Inbox') {
  const url = link ?? `${GRAPH}/me/mailFolders('${folder}')/messages/delta?$select=id,conversationId,subject,from,toRecipients,receivedDateTime,body`;
  const res = await fetch(url, { headers: authHeaders(token, { Prefer: 'outlook.body-content-type="html"' }) });
  if (!res.ok) throw new Error(`Delta failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<DeltaResp>;
}
