import * as vscode from 'vscode';

const GROQ_API_KEY_SECRET = 'groqApiKey';


export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    return await context.secrets.get(GROQ_API_KEY_SECRET);
}

/**
 * Securely stores the Groq API key using VS Code's SecretStorage API.
 */
export async function storeApiKey(context: vscode.ExtensionContext, apiKey: string): Promise<void> {
    await context.secrets.store(GROQ_API_KEY_SECRET, apiKey);
}

export async function deleteApiKey(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete(GROQ_API_KEY_SECRET);
}