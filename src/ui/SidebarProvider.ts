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

/** Distinguishes why commit history could not be loaded, so the webview can render a helpful empty state. */
class NoWorkspaceError extends Error {}

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
          this._view?.webview.postMessage({ type: 'analyzeStart' });
          try {
            await vscode.commands.executeCommand('git-ai-summarizer.analyzeDiffWithSelection', {
              commitA: data.commitA,
              commitB: data.commitB,
            });
          } finally {
            this._view?.webview.postMessage({ type: 'analyzeEnd' });
          }
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
      throw new NoWorkspaceError('No workspace folder is open.');
    }

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
  }

  private async _refreshCommits() {
    if (!this._view) {
      return;
    }

    this._view.webview.postMessage({ type: 'loading' });

    try {
      const commits = await this._getRecentGitCommits();
      this._view.webview.postMessage({ type: 'setCommits', commits });
    } catch (err) {
      if (err instanceof NoWorkspaceError) {
        this._view.webview.postMessage({ type: 'noWorkspace' });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        this._view.webview.postMessage({ type: 'gitError', message });
      }
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
            --warn-fg: var(--vscode-editorWarning-foreground, #cca700);
            --err-fg: var(--vscode-editorError-foreground, #f14c4c);
            --badge-bg: var(--vscode-badge-background);
            --badge-fg: var(--vscode-badge-foreground);
          }

          * {
            box-sizing: border-box;
          }

          body {
            font-family: var(--font-family);
            padding: 16px 12px;
            margin: 0;
            color: var(--vscode-foreground);
          }

          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
          }

          .header-title {
            display: flex;
            align-items: center;
            gap: 8px;
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

          .commit-badge {
            font-size: 10px;
            font-weight: 600;
            padding: 1px 6px;
            border-radius: 10px;
            background: var(--badge-bg);
            color: var(--badge-fg);
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
            display: flex;
          }

          .icon-btn:hover:not(:disabled) {
            opacity: 1;
            background: rgba(255,255,255,0.05);
          }

          .icon-btn:disabled {
            cursor: default;
            opacity: 0.35;
          }

          .icon-btn.spinning span {
            display: inline-block;
            animation: spin 0.8s linear infinite;
          }

          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
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
            text-overflow: ellipsis;
          }

          select:focus {
            border-color: var(--vscode-focusBorder);
          }

          select:disabled {
            opacity: 0.6;
            cursor: default;
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

          .btn-primary:hover:not(:disabled) {
            background-color: var(--btn-hover);
          }

          .btn-primary:disabled {
            opacity: 0.5;
            cursor: default;
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

          .status-message {
            display: none;
            align-items: flex-start;
            gap: 6px;
            font-size: 11px;
            line-height: 1.4;
            padding: 8px 10px;
            border-radius: 6px;
            margin-top: 8px;
          }

          .status-message.visible {
            display: flex;
          }

          .status-message.warn {
            background: color-mix(in srgb, var(--warn-fg) 15%, transparent);
            color: var(--warn-fg);
          }

          .status-message.error {
            background: color-mix(in srgb, var(--err-fg) 15%, transparent);
            color: var(--err-fg);
          }

          .empty-state {
            display: none;
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 8px;
            padding: 28px 12px;
            opacity: 0.8;
          }

          .empty-state.visible {
            display: flex;
          }

          .empty-state .empty-icon {
            font-size: 24px;
          }

          .empty-state .empty-title {
            font-size: 12px;
            font-weight: 600;
          }

          .empty-state .empty-detail {
            font-size: 11px;
            opacity: 0.75;
            max-width: 220px;
          }

          .main-content {
            display: none;
          }

          .main-content.visible {
            display: block;
          }

          .spinner-inline {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 2px solid currentColor;
            border-top-color: transparent;
            animation: spin 0.7s linear infinite;
            display: inline-block;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-title">
            <h3>⚡ Git AI Summarizer</h3>
            <span class="commit-badge" id="commitBadge" style="display:none;"></span>
          </div>
          <button class="icon-btn" id="refreshBtn" title="Refresh Commits" onclick="refreshCommits()"><span>🔄</span></button>
        </div>

        <div class="empty-state" id="emptyState">
          <div class="empty-icon" id="emptyIcon">📁</div>
          <div class="empty-title" id="emptyTitle">No workspace open</div>
          <div class="empty-detail" id="emptyDetail">Open a folder containing a Git repository to get started.</div>
        </div>

        <div class="main-content" id="mainContent">
          <div class="form-group">
            <label for="commitA">Base Commit (From)</label>
            <select id="commitA" onchange="onSelectionChange()">
              <option value="">Loading history...</option>
            </select>
          </div>

          <div class="form-group">
            <label for="commitB">Target Commit (To)</label>
            <select id="commitB" onchange="onSelectionChange()">
              <option value="HEAD">HEAD (Working Tree / Latest)</option>
            </select>
          </div>

          <div class="status-message" id="statusMessage"></div>

          <button class="btn-primary" id="analyzeBtn" onclick="analyze()">
            <span id="analyzeIcon">✨</span>
            <span id="analyzeLabel">Analyze Differences</span>
          </button>
        </div>

        <div class="footer">
          <button class="btn-secondary" onclick="setApiKey()">🔑 Change API Key</button>
          <p class="hint">Select base and target commits to generate structured commit summaries and architectural insights.</p>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          let currentCommits = [];
          let isAnalyzing = false;

          const refreshBtn = document.getElementById('refreshBtn');
          const emptyState = document.getElementById('emptyState');
          const emptyIcon = document.getElementById('emptyIcon');
          const emptyTitle = document.getElementById('emptyTitle');
          const emptyDetail = document.getElementById('emptyDetail');
          const mainContent = document.getElementById('mainContent');
          const commitBadge = document.getElementById('commitBadge');
          const statusMessage = document.getElementById('statusMessage');
          const analyzeBtn = document.getElementById('analyzeBtn');
          const analyzeIcon = document.getElementById('analyzeIcon');
          const analyzeLabel = document.getElementById('analyzeLabel');

          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
              case 'loading':
                setRefreshing(true);
                break;
              case 'setCommits':
                setRefreshing(false);
                currentCommits = message.commits || [];
                if (currentCommits.length === 0) {
                  showEmptyState('📭', 'No commits found', 'This repository does not have any commits yet.');
                } else {
                  showMainContent();
                  populateDropdowns();
                }
                break;
              case 'noWorkspace':
                setRefreshing(false);
                showEmptyState('📁', 'No workspace open', 'Open a folder containing a Git repository to get started.');
                break;
              case 'gitError':
                setRefreshing(false);
                showEmptyState('⚠️', 'Unable to read Git history', message.message || 'Make sure Git is installed and this folder is a Git repository.');
                break;
              case 'analyzeStart':
                setAnalyzing(true);
                break;
              case 'analyzeEnd':
                setAnalyzing(false);
                break;
            }
          });

          function setRefreshing(isRefreshing) {
            refreshBtn.disabled = isRefreshing;
            refreshBtn.classList.toggle('spinning', isRefreshing);
          }

          function showEmptyState(icon, title, detail) {
            emptyIcon.textContent = icon;
            emptyTitle.textContent = title;
            emptyDetail.textContent = detail;
            emptyState.classList.add('visible');
            mainContent.classList.remove('visible');
          }

          function showMainContent() {
            emptyState.classList.remove('visible');
            mainContent.classList.add('visible');
          }

          function populateDropdowns() {
            const selectA = document.getElementById('commitA');
            const selectB = document.getElementById('commitB');

            const prevA = selectA.value;
            const prevB = selectB.value;

            commitBadge.style.display = 'inline-block';
            commitBadge.textContent = currentCommits.length + (currentCommits.length === 25 ? '+' : '');

            selectA.innerHTML = currentCommits.map((c, idx) =>
              \`<option value="\${c.sha}" title="\${escapeHtml(c.message)}">[\${c.shortSha}] \${escapeHtml(truncate(c.message, 42))}</option>\`
            ).join('');

            selectB.innerHTML = \`
              <option value="HEAD">HEAD (Working Tree)</option>
              \${currentCommits.map((c, idx) =>
                \`<option value="\${c.sha}" title="\${escapeHtml(c.message)}">[\${c.shortSha}] \${escapeHtml(truncate(c.message, 42))}</option>\`
              ).join('')}
            \`;

            // Restore the previous selection if it still exists, otherwise fall back to sensible defaults.
            if (prevA && [...selectA.options].some(o => o.value === prevA)) {
              selectA.value = prevA;
            } else if (currentCommits[1]) {
              selectA.value = currentCommits[1].sha;
            }

            if (prevB && [...selectB.options].some(o => o.value === prevB)) {
              selectB.value = prevB;
            } else {
              selectB.value = 'HEAD';
            }

            onSelectionChange();
          }

          function truncate(text, max) {
            if (!text) return '';
            return text.length > max ? text.slice(0, max - 1) + '…' : text;
          }

          function escapeHtml(text) {
            return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          }

          function onSelectionChange() {
            const commitA = document.getElementById('commitA').value;
            const commitB = document.getElementById('commitB').value;

            hideStatusMessage();

            let disable = isAnalyzing || !commitA;

            if (commitA && commitB && commitA === commitB) {
              showStatusMessage('warn', '⚠️ Base and target commits cannot be the same.');
              disable = true;
            }

            analyzeBtn.disabled = disable;
          }

          function showStatusMessage(kind, text) {
            statusMessage.textContent = text;
            statusMessage.className = 'status-message visible ' + kind;
          }

          function hideStatusMessage() {
            statusMessage.className = 'status-message';
          }

          function setAnalyzing(analyzing) {
            isAnalyzing = analyzing;
            analyzeIcon.innerHTML = analyzing ? '<span class="spinner-inline"></span>' : '✨';
            analyzeLabel.textContent = analyzing ? 'Analyzing…' : 'Analyze Differences';
            onSelectionChange();
          }

          function analyze() {
            const commitA = document.getElementById('commitA').value;
            const commitB = document.getElementById('commitB').value;

            if (!commitA || commitA === commitB || isAnalyzing) {
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