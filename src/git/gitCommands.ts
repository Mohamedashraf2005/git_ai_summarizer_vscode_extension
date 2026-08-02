export interface GitDiffOptions {
  commitA: string;
  commitB: string;
}

const EXCLUDED_LOCKFILES = [
  ':(exclude)*package-lock.json',
  ':(exclude)*yarn.lock',
  ':(exclude)*pnpm-lock.yaml',
];

export function buildGitDiffCommand(
  options: GitDiffOptions
): { command: string; args: string[] } {
  return {
    command: 'git',
    args: [
      'diff',
      `${options.commitA}..${options.commitB}`,
      '--',
      ...EXCLUDED_LOCKFILES,
    ],
  };
}

export function buildGitLogCommand(
  options: GitDiffOptions
): { command: string; args: string[] } {
  return {
    command: 'git',
    args: [
      'log',
      '--date=short',
      '--format=- **Author:** %an%n- **Date:** %ad%n- **SHA:** %H%n- **Message:** %s%n',
      `${options.commitA}..${options.commitB}`,
    ],
  };
}