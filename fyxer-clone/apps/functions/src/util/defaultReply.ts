import OpenAI from 'openai';

export async function makeDefaultReplyHTML(input: {
  customerName: string;
  subject?: string;
  plainText: string; // stripped email body
}) {
  const key = process.env.OPENAI_API_KEY;

  const oai = new OpenAI({ apiKey: key });
  const sys = `You are an executive assistant. Write only the reply BODY (no greeting/salutation and no signature) that:
- acknowledges the sender
- briefly summarizes their ask in 1 sentence
- offers next steps or requests any missing details in bullet points (2–3 bullets max)
- uses a neutral professional tone
- do not commit to a specific time unless provided
Return only HTML body using <p> and optional <ul><li>, with NO greeting like 
"Hi/Hello/Dear ...," and NO signature like "Best regards/Kind regards/Sincerely".`;

  const res = await oai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `Sender: ${input.customerName}\nSubject: ${input.subject || ''}\nBody:\n${input.plainText.slice(0, 6000)}` }
    ]
  });

  let html = res.choices[0]?.message?.content || '';
  // Strip any accidental greeting/salutation
  html = html
    .replace(/^\s*<(p|div)[^>]*>\s*(dear|hi|hello)[^<]{0,120}<\/\1>\s*/i, '')
    .replace(/^\s*(dear|hi|hello)[^<\n]{0,120}[,;:]?\s*/i, '');
  // Strip common signatures if present
  html = html
    .replace(/<(p|div)[^>]*>\s*(best|kind) regards[\s,]*<\/\1>\s*/gi, '')
    .replace(/<(p|div)[^>]*>\s*sincerely[\s,]*<\/\1>\s*/gi, '')
    .replace(/<(p|div)[^>]*>\s*(thank you|thanks)[\s,]*<\/\1>\s*/gi, '')
    .replace(/<(p|div)[^>]*>\s*your\s+team\s*<\/\1>\s*/gi, '');
  const sal = `<p>Dear ${input.customerName || 'there'},</p>`;
  const sign = `<p>Best regards,<br/>Your Team</p>`;
  return sal + html + sign + `<div style="display:none">FYXER-DEFAULT-REPLY: 1</div>`;
}
