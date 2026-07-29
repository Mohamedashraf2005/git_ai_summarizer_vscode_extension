import * as vscode from 'vscode';
import { getApiKey, storeApiKey } from './services/secretStorage';
// import { getGitDiff } from './git/gitClient';
import { generateCommitSummary } from './services/groqService';
import { getGitDiff, getGitMetadata } from './git/gitClient';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('git-ai-summarizer.analyzeDiff', async () => {
        // 1. Secret Key check
        let apiKey = await getApiKey(context);
        if (!apiKey) {
            apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your Groq API Key',
                password: true,
                ignoreFocusOut: true
            });
            if (!apiKey) {
                vscode.window.showWarningMessage('API key is required.');
                return;
            }
            await storeApiKey(context, apiKey);
        }

        // 2. Commit Selection UI (Partner 2 task)
        const selectedCommit = await vscode.window.showQuickPick([
            'HEAD~1',
            'HEAD (Uncommitted Changes)'
        ], { placeHolder: 'Select a commit or range to analyze' });

        if (!selectedCommit) {
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace folder with a Git repo first.');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;

        // 3. Show progress toast & call real AI pipeline
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Analyzing ${selectedCommit} with Groq AI...`,
            cancellable: false
        }, async () => {
           try {
                // Fetch real diff from repository
                const diffText = await getGitDiff(rootPath, selectedCommit);
                
                // Fetch the commit metadata (New!)
                const metadataText = await getGitMetadata(rootPath, selectedCommit);

                // Send diff AND metadata to Llama 3.3 via Groq
                const aiSummaryResult = await generateCommitSummary(apiKey!, selectedCommit, diffText, metadataText);

                // Render real output tab
                const doc = await vscode.workspace.openTextDocument({
                    content: aiSummaryResult,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, { preview: true });

            } catch (err: any) {
                vscode.window.showErrorMessage(`Analysis failed: ${err.message}`);
            }
        });
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}