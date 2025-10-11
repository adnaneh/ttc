import { NextRequest } from 'next/server';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { getThread, pineconeSearch, createDraft } from '@/lib/server-tools';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { userId, threadId, action } = await req.json();

  const result = await generateText({
    model: openai('gpt-4.1-mini'),
    system: 'You write helpful, concise emails in the user’s voice. Never send automatically.',
    prompt: `User ${userId} requested ${action} on thread ${threadId}.`,
    maxSteps: 4,
    tools: {
      get_thread: tool({
        description: 'Fetch a mail thread',
        parameters: z.object({ threadId: z.string() }),
        execute: async ({ threadId }) => await getThread(userId, threadId)
      }),
      rag_search: tool({
        description: 'Search related context',
        parameters: z.object({ query: z.string() }),
        execute: async ({ query }) => await pineconeSearch(userId, query)
      }),
      create_draft: tool({
        description: 'Create an unsent draft',
        parameters: z.object({ threadId: z.string(), bodyHtml: z.string() }),
        execute: async (p) => await createDraft(userId, p.threadId, p.bodyHtml)
      })
    }
  });

  return Response.json({ text: result.text, steps: result.steps });
}

