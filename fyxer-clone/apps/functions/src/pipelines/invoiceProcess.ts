import { extractInvoiceFieldsFromPdf, InvoiceFields } from './invoiceExtract';
import { fetchInvoiceByIdentifiers } from '../util/hana';
import { findIncoherences } from '../util/invoiceCompare';
import { createGmailDraftReply } from '../util/gmailDraft';
import { db } from '../util/firestore';
import { env } from '../env';
import { readByPtr } from '../util/storage';
import { getFreshAccessTokenForMailbox } from '../util/tokenStore';
import { google } from 'googleapis';

function escapeHtml(s: string) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)); }

export async function processInvoicePdf(args: {
  mailboxId: string;
  threadId: string;
  messageId: string;
  attachment: { filename: string; ptr: string };
  orgId?: string;
}) {
  const buf = await readByPtr(args.attachment.ptr);
  const fields: InvoiceFields = await extractInvoiceFieldsFromPdf(buf);

  // Try SAP lookup
  const sap = await fetchInvoiceByIdentifiers({
    invoiceNo: fields.invoiceNo,
    vendorId: fields.vendorId,
    currency: fields.currency,
    amount: fields.amount,
    invoiceDate: fields.invoiceDate,
    poNumber: fields.poNumber
  });

  if (!sap) {
    // Optionally, create a friendly draft saying "no match found" (comment out if not desired)
    return { matched: false };
  }

  const incoherences = findIncoherences(fields, sap);
  if (incoherences.length === 0) return { matched: true, coherent: true };

  // Build a case and draft
  const caseRef = db.collection('cases').doc();
  const notifyTo = env.INVOICE_NOTIFY_DEFAULT;
  const subject = `Invoice inconsistency: ${fields.invoiceNo || args.attachment.filename}`;

  // Pull message-id of last message in thread (optional; helps threading)
  const token = await getFreshAccessTokenForMailbox(db.collection('mailboxes').doc(args.mailboxId).path);
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  const gmail = google.gmail({ version: 'v1', auth });
  const thread = await gmail.users.threads.get({ userId: 'me', id: args.threadId, format: 'metadata', metadataHeaders: ['Message-Id'] });
  const messages = thread.data.messages || [];
  const inReplyTo = (messages[messages.length - 1]?.payload?.headers as any[])?.find(h => h.name?.toLowerCase() === 'message-id')?.value;

  // Human-readable body with machine-parsable lines
  const lines = [
    `FYXER-CASE-ID: ${caseRef.id}`,
    ``,
    `Corrections (edit values after '->' then press Send):`
  ];
  for (const d of incoherences) lines.push(`- ${d.field}: ${d.sap} -> ${d.email}`);

  const textBody = lines.join('\n');

  const htmlRows = incoherences.map(d =>
    `<tr><td>${escapeHtml(d.field)}</td><td>${escapeHtml(String(d.sap))}</td><td><strong>${escapeHtml(String(d.email))}</strong> (edit if needed)</td></tr>`).join('');
  const htmlBody =
    `<div><p>Detected inconsistencies for invoice <b>${escapeHtml(fields.invoiceNo || '')}</b>. Edit the <i>right</i> column if needed and press Send.</p>` +
    `<pre style="background:#f6f8fa;padding:8px;border-radius:6px">FYXER-CASE-ID: ${caseRef.id}\n` +
    incoherences.map(d => `- ${d.field}: ${d.sap} -> ${d.email}`).join('\n') + `</pre>` +
    `<table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Field</th><th>SAP</th><th>Proposed</th></tr></thead><tbody>${htmlRows}</tbody></table></div>`;

  const draft = await createGmailDraftReply({
    accessToken: token,
    threadId: args.threadId,
    to: notifyTo,
    subject,
    inReplyTo,
    caseId: caseRef.id,
    textBody,
    htmlBody
  });

  await caseRef.set({
    status: 'drafted',
    createdAt: Date.now(),
    mailboxId: args.mailboxId,
    threadId: args.threadId,
    messageId: args.messageId,
    draftId: draft.id,
    notifyTo,
    invoice: fields,
    sapSnapshot: sap,
    incoherences
  });

  return { matched: true, coherent: false, draftId: draft.id, caseId: caseRef.id };
}

