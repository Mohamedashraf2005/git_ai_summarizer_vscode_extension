import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function getGitDiff(workspacePath: string, commitRef: string): Promise<string> {
    try {
        // Fetch diff targeting the selected ref (e.g. HEAD~1 or HEAD)
        const command = commitRef === 'HEAD (Uncommitted Changes)' 
            ? 'git diff' 
            : `git diff ${commitRef}`;

        const { stdout } = await execAsync(command, { cwd: workspacePath });
        return stdout || 'No changes found in diff.';
    } catch (error: any) {
        return `Failed to fetch git diff: ${error.message}`;
    }
}


export async function getGitMetadata(workspacePath: string, commitRef: string): Promise<string> {
    try {
        if (commitRef === 'HEAD (Uncommitted Changes)') {
            return "- **Author:** Local Workspace\n- **Date:** Current\n- **SHA:** N/A\n- **Message:** Uncommitted Local Changes";
        }
        
        // Formats the git log output into clean Markdown bullet points
        const command = `git log -1 --format="- **Author:** %an%n- **Date:** %ad%n- **SHA:** %H%n- **Message:** %s" ${commitRef}`;
        
        const { stdout } = await execAsync(command, { cwd: workspacePath });
        return stdout.trim();
    } catch (error: any) {
        return `Failed to fetch metadata: ${error.message}`;
    }
}