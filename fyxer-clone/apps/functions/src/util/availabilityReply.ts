import type { Slot } from './availability';
import { formatSlots } from './availability';

export function renderAvailabilityHtml(params: {
  customerName: string;
  tz: string;
  slots: Slot[];
}) {
  const items = formatSlots(params.slots, params.tz);
  const list = items.map(i => `<li>${i.label}</li>`).join('');
  const body = `<p>Dear ${params.customerName || 'there'},</p>
<p>Thanks for reaching out. Here are a few times that work on my side:</p>
<ul>${list || '<li>(No suitable times found—please share your availability and I will accommodate.)</li>'}</ul>
<p>If none of these work, feel free to propose alternatives and I’ll confirm.</p>
<p>Best regards,<br/>Your Team</p>`;
  return body;
}

export function renderAcceptanceHtml(params: {
  customerName: string;
  tz: string;
  slot: Slot;
}) {
  const label = formatSlots([params.slot], params.tz)[0]?.label || '';
  const body = `<p>Dear ${params.customerName || 'there'},</p>
<p>Thanks for the options — the following time works for me:</p>
<p><strong>${label}</strong></p>
<p>I’ll send over a calendar invite with the Zoom details.</p>
<p>Best regards,<br/>Your Team</p>`;
  return body;
}
