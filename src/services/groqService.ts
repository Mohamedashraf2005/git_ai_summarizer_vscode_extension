import Groq from 'groq-sdk';
import { SYSTEM_PROMPT } from '../prompts/systemPrompt';
import { formalTemplate } from '../templates/formalTemplate';

export async function generateCommitSummary(
    apiKey: string, 
    commitRef: string, 
    gitDiffText: string,
    metadataText: string 
): Promise<string> {
    const groq = new Groq({ apiKey });

    const userContent = formalTemplate(commitRef, gitDiffText, metadataText);

    const completion = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: SYSTEM_PROMPT }, 
            { role: 'user', content: userContent }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
    });

    return completion.choices[0]?.message?.content || "No summary generated.";
}