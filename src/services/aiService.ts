// src/services/aiService.ts
import * as vscode from 'vscode';
import { SYSTEM_PROMPT } from '../prompts/systemPrompt';

// export async function generateSummaryWithGroq(diffText: string, apiKey: string, model: string = 'llama-3.3-70b-versatile'): Promise<string> {
export async function generateSummaryWithGroq(diffText: string, providedKey: string, model: string = 'llama-3.3-70b-versatile'): Promise<string> {
  const apiKey = "groq_api_key"; // Replace with your actual Groq API key or retrieve it securely
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
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
    const errorData = await response.json() as any;
    // const errorData = await response.json();
    throw new Error(`Groq API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data: any = await response.json();
  return data.choices[0]?.message?.content || 'No summary generated.';
}