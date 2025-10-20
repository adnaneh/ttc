import OpenAI from 'openai';

let client!: OpenAI;
let clientInitialized = false;

function getClient(key: string): OpenAI {
  if (!clientInitialized) {
    client = new OpenAI({ apiKey: key });
    clientInitialized = true;
  }
  return client;
}

/**
 * Ask the LLM to extract shipment spec from email text.
 * Returns a partial object; caller merges with regex result.
 */
export async function llmExtractShipment(text: string): Promise<{
  qty?: number; equipment?: string; pol?: string; pod?: string; service?: string; etd?: string;
}> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return {};
  const openai = getClient(key);
  const system = `Extract a freight shipment request into JSON with keys:\n` +
    `{ "qty": number?, "equipment": string?, "pol": string?, "pod": string?, "service": string?, "etd": "YYYY-MM-DD"? }.\n` +
    `- equipment like 20GP, 40HC, 45HC, RF, NOR (no spaces)\n` +
    `- pol/pod as UN/LOCODE (CCXXX)\n` +
    `- service one of: CY/CY, CY/DOOR, DOOR/CY, DOOR/DOOR\n` +
    `Return ONLY JSON.`;
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text.slice(0, 10000) }
      ]
    });
    const content = resp.choices?.[0]?.message?.content || '{}';
    return JSON.parse(content);
  } catch {
    return {};
  }
}
