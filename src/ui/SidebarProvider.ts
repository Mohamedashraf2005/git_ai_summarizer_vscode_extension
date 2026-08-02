import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface GitCommitEntry {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  timestamp: string;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Send initial commits list when webview becomes visible
    this._refreshCommits();

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._refreshCommits();
      }
    });

    // Handle incoming messages from webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'onAnalyze': {
          vscode.commands.executeCommand('git-ai-summarizer.analyzeDiffWithSelection', {
            commitA: data.commitA,
            commitB: data.commitB,
          });
          break;
        }
        case 'onSetApiKey': {
          vscode.commands.executeCommand('git-ai-summarizer.setApiKey');
          break;
        }
        case 'onRefresh': {
          await this._refreshCommits();
          break;
        }
      }
    });
  }

  private async _getRecentGitCommits(): Promise<GitCommitEntry[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return [];
    }

    try {
      const rootPath = workspaceFolders[0].uri.fsPath;
      const { stdout } = await execFileAsync(
        'git',
        [
          '-C', rootPath,
          'log',
          '--pretty=format:%H%x09%h%x09%s%x09%an%x09%ad',
          '--date=short',
          '-n', '25'
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
    } catch {
      return [];
    }
  }

  private async _refreshCommits() {
    if (this._view) {
      const commits = await this._getRecentGitCommits();
      this._view.webview.postMessage({ type: 'setCommits', commits });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Git AI Summarizer</title>
        <style>
          :root {
            --font-family: var(--vscode-font-family, system-ui, sans-serif);
            --bg-card: var(--vscode-sideBar-background);
            --input-bg: var(--vscode-input-background);
            --input-fg: var(--vscode-input-foreground);
            --input-border: var(--vscode-input-border, transparent);
            --btn-bg: var(--vscode-button-background);
            --btn-fg: var(--vscode-button-foreground);
            --btn-hover: var(--vscode-button-hoverBackground);
            --sec-btn-bg: var(--vscode-button-secondaryBackground);
            --sec-btn-fg: var(--vscode-button-secondaryForeground);
          }

          body {
            font-family: var(--font-family);
            padding: 16px 12px;
            margin: 0;
            color: var(--vscode-foreground);
            box-sizing: border-box;
          }

          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
          }

          .header h3 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .icon-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px 6px;
            border-radius: 4px;
            opacity: 0.7;
            transition: opacity 0.2s;
          }

          .icon-btn:hover {
            opacity: 1;
            background: rgba(255,255,255,0.05);
          }

          .form-group {
            margin-bottom: 14px;
          }

          label {
            display: block;
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 6px;
            opacity: 0.8;
            text-transform: uppercase;
          }

          select {
            width: 100%;
            padding: 8px 10px;
            background-color: var(--input-bg);
            color: var(--input-fg);
            border: 1px solid var(--input-border);
            border-radius: 6px;
            font-family: var(--font-family);
            font-size: 12px;
            outline: none;
            box-sizing: border-box;
          }

          select:focus {
            border-color: var(--vscode-focusBorder);
          }

          .btn-primary {
            width: 100%;
            padding: 10px;
            margin-top: 10px;
            background-color: var(--btn-bg);
            color: var(--btn-fg);
            border: none;
            cursor: pointer;
            border-radius: 6px;
            font-weight: 600;
            font-size: 13px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: background 0.2s;
          }

          .btn-primary:hover {
            background-color: var(--btn-hover);
          }

          .btn-secondary {
            width: 100%;
            padding: 8px;
            margin-top: 8px;
            background-color: var(--sec-btn-bg);
            color: var(--sec-btn-fg);
            border: none;
            cursor: pointer;
            border-radius: 6px;
            font-size: 12px;
          }

          .footer {
            margin-top: 20px;
            padding-top: 12px;
            border-top: 1px dashed var(--vscode-widget-border, rgba(255,255,255,0.1));
          }

          .hint {
            font-size: 11px;
            opacity: 0.6;
            margin-top: 6px;
            line-height: 1.4;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h3>⚡ Git AI Summarizer</h3>
          <button class="icon-btn" title="Refresh Commits" onclick="refreshCommits()">🔄</button>
        </div>

        <div class="form-group">
          <label for="commitA">Base Commit (From)</label>
          <select id="commitA">
            <option value="">Loading history...</option>
          </select>
        </div>

        <div class="form-group">
          <label for="commitB">Target Commit (To)</label>
          <select id="commitB">
            <option value="HEAD">HEAD (Working Tree / Latest)</option>
          </select>
        </div>

        <button class="btn-primary" onclick="analyze()">✨ Analyze Differences</button>

        <div class="footer">
          <button class="btn-secondary" onclick="setApiKey()">🔑 Change API Key</button>
          <p class="hint">Select base and target commits to generate structured commit summaries and architectural insights.</p>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          let currentCommits = [];

          window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'setCommits') {
              currentCommits = message.commits;
              populateDropdowns();
            }
          });

          function populateDropdowns() {
            const selectA = document.getElementById('commitA');
            const selectB = document.getElementById('commitB');

            if (!currentCommits || currentCommits.length === 0) {
              selectA.innerHTML = '<option value="">No Git history found</option>';
              return;
            }

            // Options for Base Commit
            selectA.innerHTML = currentCommits.map((c, idx) => 
              \`<option value="\${c.sha}" \${idx === 1 ? 'selected' : ''}>[\${c.shortSha}] \${escapeHtml(c.message)}</option>\`
            ).join('');

            // Options for Target Commit
            selectB.innerHTML = \`
              <option value="HEAD" selected>HEAD (Working Tree)</option>
              \${currentCommits.map((c, idx) => 
                \`<option value="\${c.sha}">[\${c.shortSha}] \${escapeHtml(c.message)}</option>\`
              ).join('')}
            \`;
          }

          function escapeHtml(text) {
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          }

          function analyze() {
            const commitA = document.getElementById('commitA').value;
            const commitB = document.getElementById('commitB').value;

            if (!commitA) {
              return;
            }

            vscode.postMessage({
              type: 'onAnalyze',
              commitA,
              commitB
            });
          }

          function setApiKey() {
            vscode.postMessage({ type: 'onSetApiKey' });
          }

          function refreshCommits() {
            vscode.postMessage({ type: 'onRefresh' });
          }
        </script>
      </body>
      </html>
    `;
  }
}