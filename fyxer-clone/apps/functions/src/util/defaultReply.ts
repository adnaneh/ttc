import OpenAI from 'openai';

let openai: OpenAI | null = null;
function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!openai) openai = new OpenAI({ apiKey: key });
  return openai;
}

export async function makeDefaultReplyHTML(input: {
  customerName: string;
  subject?: string;
  plainText: string; // stripped email body
}) {
  const oai = getOpenAI();
  if (!oai) {
    // Minimal friendly fallback
    return `<p>Dear ${input.customerName || 'there'},</p>
<p>Thanks for your email. I’ll review and get back to you shortly. If you can share any additional details that would help, please reply here.</p>
<p>Best regards,<br/>Your Team</p>`;
  }

  const sys = `You are an executive assistant. Write a short, friendly reply that:
- acknowledges the sender
- briefly summarizes their ask in 1 sentence
- offers next steps or requests any missing details in bullet points (2–3 bullets max)
- uses a neutral professional tone
- do not commit to a specific time unless provided
Return only HTML (paragraphs and <ul><li>).`;

  const res = await oai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `Sender: ${input.customerName}\nSubject: ${input.subject || ''}\nBody:\n${input.plainText.slice(0, 6000)}` }
    ]
  });

  const html = res.choices[0]?.message?.content || '';
  const sal = `<p>Dear ${input.customerName || 'there'},</p>`;
  const sign = `<p>Best regards,<br/>Your Team</p>`;
  return sal + html + sign + `<div style="display:none">FYXER-DEFAULT-REPLY: 1</div>`;
}

