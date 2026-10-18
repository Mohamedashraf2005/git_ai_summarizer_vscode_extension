import { SYSTEM_PROMPT } from '../prompts/systemPrompt';

export async function generateSummaryWithGroq(
  diffText: string,
  providedKey: string,
  model: string = 'openai/gpt-oss-120b'
  // model="openai/gpt-oss-120b",
): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${providedKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Analyze the following Git diff:\n\n${diffText}` }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorData = await response.json() as { error?: { message?: string } };
    throw new Error(`Groq API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return data.choices?.[0]?.message?.content || 'No summary generated.';
}