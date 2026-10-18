import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { buildGitDiffCommand, buildGitLogCommand } from './gitCommands';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Keep input comfortably below free-tier per-minute token limits.
const MAX_DIFF_LENGTH = 45000;

async function runCommand(workspacePath: string, command: string | { command: string; args: string[] }): Promise<string> {
    if (typeof command === 'string') {
        const { stdout } = await execAsync(command, { cwd: workspacePath });
        return stdout;
    }

    const { stdout } = await execFileAsync(command.command, command.args, { cwd: workspacePath });
    return stdout;
}

export async function getGitDiff(workspacePath: string, commitA: string, commitB: string): Promise<string> {
    try {
        const command = buildGitDiffCommand({ commitA, commitB });
        let stdout = await runCommand(workspacePath, command);

        if (!stdout || !stdout.trim()) {
            return 'No changes found in diff.';
        }

        // Truncate oversized diffs before sending them to the model.
        if (stdout.length > MAX_DIFF_LENGTH) {
            stdout = stdout.substring(0, MAX_DIFF_LENGTH) + 
                '\n\n... [NOTE: Git diff was automatically truncated to fit AI context token limits] ...';
        }

        return stdout;
    } catch (error: any) {
        return `Failed to fetch git diff: ${error.message}`;
    }
}

export async function getGitMetadata(workspacePath: string, commitA: string, commitB: string): Promise<string> {
    try {
        const command = buildGitLogCommand({ commitA, commitB });
        const stdout = await runCommand(workspacePath, command);
        return stdout.trim() || 'No commits found in the selected range.';
    } catch (error: any) {
        return `Failed to fetch metadata: ${error.message}`;
    }
}