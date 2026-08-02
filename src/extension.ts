import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { clearApiKey, getApiKey, storeApiKey } from './services/secretStorage';
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

const changeApiKeyButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('key'),
    tooltip: 'Change API Key'
};

const refreshCommitsButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('refresh'),
    tooltip: 'Refresh Commits'
};

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

function buildTargetCommitItems(historyItems: CommitQuickPickItem[]): CommitQuickPickItem[] {
    return [
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
    ];
}

async function changeApiKey(context: vscode.ExtensionContext): Promise<void> {
    await clearApiKey(context);

    const newApiKey = await vscode.window.showInputBox({
        prompt: 'Enter your Groq API Key',
        password: true,
        ignoreFocusOut: true
    });

    if (!newApiKey) {
        vscode.window.showWarningMessage('API key was not updated.');
        return;
    }

    await storeApiKey(context, newApiKey);
    vscode.window.showInformationMessage('Groq API key updated.');
}

async function pickCommitSelection(context: vscode.ExtensionContext, rootPath: string): Promise<{ commitA: string; commitB: string } | undefined> {
    const commits = await getRecentGitCommits(rootPath);
    const historyItems = commits.map(toCommitQuickPickItem);

    while (true) {
        const commitA = await pickCommitStep({
            title: 'Step 1/2: Select Base Commit (commitA)',
            items: historyItems,
            placeHolder: 'Select the base commit (commitA)',
            activeItem: historyItems[0],
            refreshItems: async () => {
                const refreshed = await getRecentGitCommits(rootPath);
                return refreshed.map(toCommitQuickPickItem);
            },
            onChangeApiKey: async () => {
                await changeApiKey(context);
            }
        });

        if (!commitA || commitA === 'back') {
            return undefined;
        }

        const commitB = await pickCommitStep({
            title: 'Step 2/2: Select Target Commit (commitB)',
            items: buildTargetCommitItems(historyItems),
            placeHolder: 'Select the target commit (commitB)',
            activeItem: historyItems[0],
            showBackButton: true,
            refreshItems: async () => {
                const refreshed = await getRecentGitCommits(rootPath);
                return buildTargetCommitItems(refreshed.map(toCommitQuickPickItem));
            },
            onChangeApiKey: async () => {
                await changeApiKey(context);
            }
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
    refreshItems?: () => Promise<CommitQuickPickItem[]>;
    onChangeApiKey?: () => Promise<void>;
}): Promise<CommitQuickPickItem | 'back' | undefined> {
    const quickPick = vscode.window.createQuickPick<CommitQuickPickItem>();
    quickPick.title = options.title;
    quickPick.placeholder = options.placeHolder;
    quickPick.ignoreFocusOut = true;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = options.items;

    const buttons = [
        changeApiKeyButton,
        refreshCommitsButton,
        ...(options.showBackButton ? [vscode.QuickInputButtons.Back] : [])
    ];

    quickPick.buttons = buttons;

    if (options.activeItem) {
        quickPick.activeItems = [options.activeItem];
    }

    return await new Promise<CommitQuickPickItem | 'back' | undefined>((resolve) => {
        let resolved = false;

        let acceptDisposable: vscode.Disposable;
        let buttonDisposable: vscode.Disposable;
        let hideDisposable: vscode.Disposable;

        const dispose = () => {
            if (resolved) {
                return;
            }
            resolved = true;
            acceptDisposable.dispose();
            buttonDisposable.dispose();
            hideDisposable.dispose();
        };

        acceptDisposable = quickPick.onDidAccept(() => {
            const selection = quickPick.selectedItems[0] || quickPick.activeItems[0];
            quickPick.hide();
            dispose();
            resolve(selection);
        });

        buttonDisposable = quickPick.onDidTriggerButton(async (button) => {
            if (button === vscode.QuickInputButtons.Back) {
                quickPick.hide();
                dispose();
                resolve('back');
                return;
            }

            if (button === changeApiKeyButton && options.onChangeApiKey) {
                await options.onChangeApiKey();
                return;
            }

            if (button === refreshCommitsButton && options.refreshItems) {
                quickPick.busy = true;
                try {
                    quickPick.items = await options.refreshItems();
                } finally {
                    quickPick.busy = false;
                }
            }
        });

        hideDisposable = quickPick.onDidHide(() => {
            dispose();
            if (!resolved) {
                resolve(undefined);
            }
        });

        quickPick.show();
    });
}

async function ensureApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    let apiKey = await getApiKey(context);
    if (apiKey) {
        return apiKey;
    }

    apiKey = await vscode.window.showInputBox({
        prompt: 'Enter your Groq API Key',
        password: true,
        ignoreFocusOut: true
    });

    if (!apiKey) {
        return undefined;
    }

    await storeApiKey(context, apiKey);
    return apiKey;
}

async function runAnalysis(context: vscode.ExtensionContext, rootPath: string, apiKey: string, selection: { commitA: string; commitB: string }) {
    const selectedCommit = `${selection.commitA}..${selection.commitB}`;
    const commitLabel = `${selection.commitA} → ${selection.commitB}`;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Analyzing ${commitLabel} with Groq AI...`,
        cancellable: false
    }, async () => {
        try {
            const diffText = await getGitDiff(rootPath, selection.commitA, selection.commitB);
            const metadataText = await getGitMetadata(rootPath, selection.commitA, selection.commitB);

            const aiSummaryResult = await generateCommitSummary(apiKey, selectedCommit, diffText, metadataText);

            const doc = await vscode.workspace.openTextDocument({
                content: aiSummaryResult,
                language: 'markdown'
            });

            await vscode.window.showTextDocument(doc, { preview: true });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Analysis failed: ${err.message}`);
        }
    });
}

export function activate(context: vscode.ExtensionContext) {
    const analyzeDiff = vscode.commands.registerCommand('git-ai-summarizer.analyzeDiff', async () => {
        const apiKey = await ensureApiKey(context);
        if (!apiKey) {
            vscode.window.showWarningMessage('API key is required.');
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace folder with a Git repo first.');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;

        let selection: { commitA: string; commitB: string } | undefined;
        try {
            selection = await pickCommitSelection(context, rootPath);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Unable to load commit history: ${error.message}`);
            return;
        }

        if (!selection) {
            return;
        }

        await runAnalysis(context, rootPath, apiKey, selection);
    });

    const copyMarkdownReport = vscode.commands.registerCommand('git-ai-summarizer.copyMarkdownReport', async () => {
        const editor = vscode.window.activeTextEditor;
        const text = editor?.document.getText() ?? '';

        if (!text) {
            vscode.window.showWarningMessage('No markdown report is currently open.');
            return;
        }

        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage('Markdown report copied to clipboard.');
    });

    const compareDifferentRange = vscode.commands.registerCommand('git-ai-summarizer.compareDifferentRange', async () => {
        const apiKey = await ensureApiKey(context);
        if (!apiKey) {
            vscode.window.showWarningMessage('API key is required.');
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace folder with a Git repo first.');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;

        let selection: { commitA: string; commitB: string } | undefined;
        try {
            selection = await pickCommitSelection(context, rootPath);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Unable to load commit history: ${error.message}`);
            return;
        }

        if (!selection) {
            return;
        }

        await runAnalysis(context, rootPath, apiKey, selection);
    });

    context.subscriptions.push(analyzeDiff, copyMarkdownReport, compareDifferentRange);
}

export function deactivate() {}