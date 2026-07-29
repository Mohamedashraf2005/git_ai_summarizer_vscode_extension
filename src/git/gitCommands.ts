export interface GitDiffOptions {
  commitA: string;
  commitB: string;
}

export function buildGitDiffCommand(options: GitDiffOptions): { command: string; args: string[] } {
  return {
    command: 'git',
    args: [
      'diff',
      `${options.commitA}..${options.commitB}`,
      '--',
      ':(exclude)*package-lock.json',
      ':(exclude)*yarn.lock',
      ':(exclude)*pnpm-lock.yaml'
    ]
  };
}

export function buildGitLogCommand(options: GitDiffOptions): { command: string; args: string[] } {
  return {
    command: 'git',
    args: ['log', '--oneline', `${options.commitA}..${options.commitB}`]
  };
}