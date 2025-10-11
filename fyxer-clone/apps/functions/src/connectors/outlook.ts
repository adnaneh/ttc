// Minimal Graph webhook/subscription helpers (use MSAL/OBO for production)
const GRAPH = 'https://graph.microsoft.com/v1.0';

export async function createSubscription(token: string, notificationUrl: string, expirationISO: string) {
  const res = await fetch(`${GRAPH}/subscriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changeType: "created,updated",
      notificationUrl,
      resource: "me/mailFolders('Inbox')/messages",
      expirationDateTime: expirationISO,
      clientState: "secureRandom"
    })
  });
  if (!res.ok) throw new Error(`Graph subscription failed: ${res.status} ${await res.text()}`);
  return res.json();
}

