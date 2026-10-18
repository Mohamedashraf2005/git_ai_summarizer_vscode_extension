import Groq from 'groq-sdk';
import { SYSTEM_PROMPT } from '../prompts/systemPrompt';
import { formalTemplate } from '../templates/formalTemplate';

const MAX_METADATA_LENGTH = 1500;

export async function generateCommitSummary(
    apiKey: string, 
    commitRef: string, 
    gitDiffText: string,
    metadataText: string 
): Promise<string> {
    const groq = new Groq({ apiKey });

    const boundedMetadata = metadataText.length > MAX_METADATA_LENGTH
        ? `${metadataText.slice(0, MAX_METADATA_LENGTH)}\n\n... [commit metadata truncated] ...`
        : metadataText;
    const userContent = formalTemplate(commitRef, gitDiffText, boundedMetadata);

    const completion = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: SYSTEM_PROMPT }, 
            { role: 'user', content: userContent }
        ],
        model: 'openai/gpt-oss-120b',
        max_completion_tokens: 3072,
        temperature: 0.3,
    });

    return completion.choices[0]?.message?.content || "No summary generated.";
}