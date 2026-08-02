import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getApiKey, storeApiKey } from './services/secretStorage';
import { generateCommitSummary } from './services/groqService';
import { getGitDiff, getGitMetadata } from './git/gitClient';

const execFileAsync = promisify(execFile);

interface GitCommitEntry {
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    timestamp: string;
}

interface CommitQuickPickItem extends vscode.QuickPickItem {
    value: string;
}

async function getRecentGitCommits(rootPath: string): Promise<GitCommitEntry[]> {
    const { stdout } = await execFileAsync(
        'git',
        [
            '-C', rootPath,
            'log',
            '--pretty=format:%H%x09%h%x09%s%x09%an%x09%ad',
            '--date=short',
            '-n', '20'
        ],
        { encoding: 'utf8' }
    );

    return stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
            const [sha, shortSha, message, author, timestamp] = line.split('\t');
            return { sha, shortSha, message, author, timestamp };
        });
}

function toCommitQuickPickItem(commit: GitCommitEntry): CommitQuickPickItem {
    return {
        label: commit.shortSha,
        description: commit.message,
        detail: `Author: ${commit.author} • ${commit.timestamp}`,
        value: commit.sha
    };
}

async function pickCommitSelection(rootPath: string): Promise<{ commitA: string; commitB: string } | undefined> {
    const commits = await getRecentGitCommits(rootPath);
    const historyItems = commits.map(toCommitQuickPickItem);

    while (true) {
        const commitA = await pickCommitStep({
            title: 'Step 1/2: Select Base Commit (commitA)',
            items: historyItems,
            placeHolder: 'Select the base commit (commitA)',
            activeItem: historyItems[0]
        });

        if (!commitA || commitA === 'back') {
            return undefined;
        }

        const commitB = await pickCommitStep({
            title: 'Step 2/2: Select Target Commit (commitB)',
            items: [
                {
                    label: 'HEAD',
                    description: 'Uncommitted local changes',
                    detail: 'Compare against the current working tree',
                    value: 'HEAD'
                },
                {
                    label: 'HEAD',
                    description: 'Latest commit',
                    detail: 'Compare against the latest commit',
                    value: 'HEAD'
                },
                ...historyItems
            ],
            placeHolder: 'Select the target commit (commitB)',
            activeItem: historyItems[0],
            showBackButton: true
        });

        if (!commitB) {
            return undefined;
        }

        if (commitB === 'back') {
            continue;
        }

        return {
            commitA: commitA.value,
            commitB: commitB.value
        };
    }
}

async function pickCommitStep(options: {
    title: string;
    items: CommitQuickPickItem[];
    placeHolder: string;
    activeItem?: CommitQuickPickItem;
    showBackButton?: boolean;
}): Promise<CommitQuickPickItem | 'back' | undefined> {
    const quickPick = vscode.window.createQuickPick<CommitQuickPickItem>();
    quickPick.title = options.title;
    quickPick.placeholder = options.placeHolder;
    quickPick.ignoreFocusOut = true;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = options.items;
    quickPick.buttons = options.showBackButton ? [vscode.QuickInputButtons.Back] : [];

    if (options.activeItem) {
        quickPick.activeItems = [options.activeItem];
    }

    return await new Promise<CommitQuickPickItem | 'back' | undefined>((resolve) => {
        let resolved = false;

        const dispose = () => {
            if (resolved) {
                return;
            }
            resolved = true;
            acceptDisposable.dispose();
            buttonDisposable.dispose();
            hideDisposable.dispose();
        };

        const acceptDisposable = quickPick.onDidAccept(() => {
            const selection = quickPick.selectedItems[0] || quickPick.activeItems[0];
            quickPick.hide();
            dispose();
            resolve(selection);
        });

        const buttonDisposable = quickPick.onDidTriggerButton((button) => {
            if (button === vscode.QuickInputButtons.Back) {
                quickPick.hide();
                dispose();
                resolve('back');
            }
        });

        const hideDisposable = quickPick.onDidHide(() => {
            dispose();
            if (!resolved) {
                resolve(undefined);
            }
        });

        quickPick.show();
    });
}

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('git-ai-summarizer.analyzeDiff', async () => {
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

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace folder with a Git repo first.');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;

        let selection: { commitA: string; commitB: string } | undefined;
        try {
            selection = await pickCommitSelection(rootPath);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Unable to load commit history: ${error.message}`);
            return;
        }

        if (!selection) {
            return;
        }

        const selectedCommit = `${selection.commitA}..${selection.commitB}`;
        const commitLabel = `${selection.commitA} → ${selection.commitB}`;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Analyzing ${commitLabel} with Groq AI...`,
            cancellable: false
        }, async () => {
            try {
                const diffText = await getGitDiff(rootPath, selectedCommit);
                const metadataText = await getGitMetadata(rootPath, selectedCommit);

                const aiSummaryResult = await generateCommitSummary(apiKey!, selectedCommit, diffText, metadataText);

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