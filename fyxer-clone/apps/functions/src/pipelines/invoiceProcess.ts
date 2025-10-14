import { extractInvoiceFieldsFromPdf, extractInvoiceFieldsFromImage, InvoiceFields } from './invoiceExtract';
import { fetchInvoiceByIdentifiers } from '../util/hana';
import { findIncoherences } from '../util/invoiceCompare';
import { createGmailDraftReply } from '../util/gmailDraft';
import { createOutlookDraftReply } from '../util/outlookDraft';
import { db } from '../util/firestore';
import { readByPtr } from '../util/storage';
import { getFreshAccessTokenForMailbox, getFreshGraphAccessTokenForMailbox } from '../util/tokenStore';
import { google } from 'googleapis';

function escapeHtml(s: string) { return String(s).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]!)); }

export async function processInvoiceAttachment(args: {
  provider: 'gmail'|'outlook';
  mailboxId: string;
  threadId: string;       // gmail: threadId; outlook: conversationId
  messageId: string;      // gmail: messageId; outlook: messageId (for reply target)
  attachment: { filename: string; ptr: string; mimeType?: string };
  orgId?: string;
}) {
  const buf = await readByPtr(args.attachment.ptr);
  const mime = (args.attachment.mimeType || '').toLowerCase();
  const name = (args.attachment.filename || '').toLowerCase();
  const isPdf = mime.includes('pdf') || name.endsWith('.pdf');
  const isImage = mime.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');

  let fields: InvoiceFields = {};
  if (isPdf) {
    fields = await extractInvoiceFieldsFromPdf(buf);
  } else if (isImage) {
    try {
      fields = await extractInvoiceFieldsFromImage(buf, mime || 'image/png');
    } catch {
      // Vision unavailable or failed; skip processing gracefully
      return { matched: false };
    }
  } else {
    // Unknown type: attempt PDF parse as a fallback
    fields = await extractInvoiceFieldsFromPdf(buf);
  }

  // Lookup in SAP HANA
  const sap = await fetchInvoiceByIdentifiers({
    invoiceNo: fields.invoiceNo,
    vendorId: fields.vendorId,
    currency: fields.currency,
    amount: fields.amount,
    invoiceDate: fields.invoiceDate,
    poNumber: fields.poNumber
  });
  if (!sap) return { matched: false };

  const incoherences = findIncoherences(fields, sap);
  if (incoherences.length === 0) return { matched: true, coherent: true };

  // Build case and draft
  const caseRef = db.collection('cases').doc();
  const notifyTo = process.env.INVOICE_NOTIFY_DEFAULT || 'maria.ttc@gmail.com';
  const subject = `Invoice inconsistency: ${fields.invoiceNo || args.attachment.filename}`;

  const lines = [`FYXER-CASE-ID: ${caseRef.id}`, ``,
    `Corrections (edit values after '->' then press Send):`];
  for (const d of incoherences) lines.push(`- ${d.field}: ${d.sap} -> ${d.email}`);
  const textBody = lines.join('\n');

  const htmlRows = incoherences.map(d =>
    `<tr><td>${escapeHtml(d.field)}</td><td>${escapeHtml(String(d.sap))}</td><td><strong>${escapeHtml(String(d.email))}</strong></td></tr>`).join('');
  const htmlBody =
    `<div><p>Detected inconsistencies for invoice <b>${escapeHtml(fields.invoiceNo || '')}</b>. Edit the <i>right</i> column if needed and press Send.</p>`
    + `<pre style="background:#f6f8fa;padding:8px;border-radius:6px">FYXER-CASE-ID: ${caseRef.id}\n`
    + incoherences.map(d => `- ${d.field}: ${d.sap} -> ${d.email}`).join('\n') + `</pre>`
    + `<table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Field</th><th>SAP</th><th>Proposed</th></tr></thead><tbody>${htmlRows}</tbody></table></div>`;

  // Create draft based on provider
  let draftId = '';
  if (args.provider === 'gmail') {
    // Get last message-id header for nice threading (optional)
    const token = await getFreshAccessTokenForMailbox(db.collection('mailboxes').doc(args.mailboxId).path);
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token });
    const gmail = google.gmail({ version: 'v1', auth });
    const thread = await gmail.users.threads.get({ userId: 'me', id: args.threadId, format: 'metadata', metadataHeaders: ['Message-Id'] });
    const messages = thread.data.messages || [];
    const inReplyTo = (messages[messages.length - 1]?.payload?.headers as any[])?.find(h => h.name?.toLowerCase() === 'message-id')?.value;

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
    draftId = draft.id!;
  } else {
    // Outlook reply draft addressing notifyTo (replying to the specific message keeps the conversation)
    const token = await getFreshGraphAccessTokenForMailbox(db.collection('mailboxes').doc(args.mailboxId).path);
    const { draftId: outId } = await createOutlookDraftReply({
      accessToken: token,
      replyToMessageId: args.messageId,
      to: notifyTo,
      subject,
      htmlBody
    });
    draftId = outId;
  }

  await caseRef.set({
    status: 'drafted',
    createdAt: Date.now(),
    provider: args.provider,
    mailboxId: args.mailboxId,
    threadId: args.threadId,
    messageId: args.messageId,
    draftId,
    notifyTo,
    invoice: fields,
    sapSnapshot: sap,
    incoherences
  });

  return { matched: true, coherent: false, draftId, caseId: caseRef.id };
}
