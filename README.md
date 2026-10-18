# Git AI Summarizer

A lightweight, AI-powered Visual Studio Code extension that analyzes Git diffs and generates structured commit summaries, release notes, and architectural insights. 

## Overview

Git AI Summarizer streamlines the code review and documentation process by automatically analyzing Git commit ranges and generating comprehensive, structured Markdown reports. Instead of manually parsing through complex diffs, developers can instantly obtain high-level overviews, architectural impact assessments, and security considerations powered by modern AI models.

## Key Features
- Interactive Sidebar Interface: Visually browse and select base and target commits from your recent Git history directly within VS Code.
- Structured Reporting: Generates professional Markdown reports divided into executive summaries, architectural impact, breaking changes, and security notes.


## Generated Report Structure

The extension formats AI responses into a clean, standardized Markdown template containing the following sections:

1. Executive Overview: A concise summary of the changes and their primary purpose.
2. Architectural and Structural Impact: Analysis of how the changes affect the overall codebase structure.
3. Breaking Changes and Risk Assessment: Identification of potential backward compatibility issues or high-risk modifications.
4. Security and Dependency Considerations: Notes on vulnerable patterns, dependency updates, or security implications.

## Requirements

- Visual Studio Code version 1.125.0 or newer
- A local Git repository
- An active API key for Groq

## Installation and Setup

1. Clone the repository to your local machine.
2. Navigate to the project directory and install dependencies:
   ```bash
   npm install
   ```
3. Compile the extension:
   ```bash
   npm run compile
   ```
4. Open the VS Code Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
5. Execute `Git AI Summarizer: Set API Key` and securely enter your provider API key.
## Usage

1. Open a Git-enabled workspace in VS Code.
2. Open the "Git AI Summarizer" panel from the Activity Bar.
3. The sidebar will automatically load your 25 most recent commits.
4. Select a "Base Commit (From)" and a "Target Commit (To)" (defaults to HEAD / Working Tree).
5. Click "Analyze Differences".
6. The extension will retrieve the diff, process it through the configured AI provider, and open a formatted Markdown report in the editor.
7. Use the "Copy Markdown Report" command to copy the output to your clipboard.

## Available Commands

Access these via the VS Code Command Palette:

- `Git AI Summarizer: Set API Key`: Securely store your AI provider API key.
- `Git AI Summarizer: Analyze Git Diff`: Manually trigger an analysis of the current Git state.
- `Copy Markdown Report`: Copy the currently generated report to the clipboard (available in the editor title menu when viewing a Markdown file).
- `Compare Different Range`: Initiate a comparison between two specific commit ranges.

## Repository Structure

- `src/extension.ts`: Main extension activation and command registration.
- `src/git/`: Helper functions for retrieving Git diffs and commit metadata.
- `src/services/`: AI provider integration and secure secret storage handling.
- `src/prompts/`: System prompt definitions optimized for code analysis.
- `src/templates/`: Markdown formatting templates (e.g., `formalTemplate.ts`).
- `src/ui/`: Sidebar webview implementation and message handling (`SidebarProvider.ts`).
- `package.json`: Extension manifest, command declarations, and configuration schema.

## Development

For active development, use the watch scripts to automatically recompile on file changes:

```bash
npm install
npm run watch
```