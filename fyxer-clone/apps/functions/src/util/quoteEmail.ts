import { QuoteItem } from './quoteSources';

export function numberQuoteOptions(quotes: QuoteItem[]): Array<QuoteItem & { id: string }> {
  return quotes.map((q, i) => ({ ...q, id: `QOPT-${i + 1}` }));
}

export function renderQuoteHtml(params: {
  customerName: string;
  spec: { qty?: number; equipment?: string; pol?: string; pod?: string; service?: string; etd?: string };
  quotes: Array<QuoteItem & { id: string }>;
  validDays: number;
}) {
  const { customerName, spec, quotes, validDays } = params;
  const head = `<p>Dear ${customerName || 'Customer'},</p>
  <p>Here is the quote you were asking for:</p>
  <p><b>${spec.qty || 1}×${spec.equipment || '—'} ${spec.pol || ''} → ${spec.pod || ''}${spec.service ? ', ' + spec.service : ''}${spec.etd ? ', ETD ' + spec.etd : ''}</b></p>`;

  const rows = quotes.map(q =>
    `<tr>
      <td>${q.id}</td>
      <td>${q.carrier}</td>
      <td>${q.source.toUpperCase()}</td>
      <td>${q.currency} ${q.price.toFixed(2)}</td>
      <td>${q.transitDays ?? '—'}</td>
      <td>${q.freeTimeDays ?? '—'}</td>
      <td>${q.validityTo ?? `+${validDays} days`}</td>
    </tr>`).join('');

  const table = `<table border="1" cellpadding="6" cellspacing="0">
    <thead><tr><th>Option</th><th>Carrier</th><th>Source</th><th>Price</th><th>Transit (d)</th><th>Free time</th><th>Validity</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7">No matching rates found.</td></tr>'}</tbody>
  </table>`;

  const foot = `<p>Please let me know if you’d like us to hold or book this option. Rates subject to space/equipment availability.</p>
  <p>Best regards,<br/>Your Team</p>`;

  return head + table + foot;
}
