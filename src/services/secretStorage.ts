import * as vscode from 'vscode';

const API_KEY_SECRET_KEY = 'groqApiKey';

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    return await context.secrets.get(API_KEY_SECRET_KEY);
}

export async function storeApiKey(context: vscode.ExtensionContext, apiKey: string): Promise<void> {
    await context.secrets.store(API_KEY_SECRET_KEY, apiKey);
}

export async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete(API_KEY_SECRET_KEY);
}