import * as cp from "child_process";
import * as path from "path";

function run(cmd: string, cwd: string): string {
  try {
    return cp.execSync(cmd, { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

export function getCommitHash(workspacePath: string): string {
  return run("git rev-parse HEAD", workspacePath) || "unknown";
}

export function getBranch(workspacePath: string): string {
  return run("git rev-parse --abbrev-ref HEAD", workspacePath) || "main";
}

export function getPreviousCommitHash(workspacePath: string): string {
  return run("git rev-parse HEAD~1", workspacePath) || "unknown";
}

export function getRepoName(workspacePath: string): string {
  const remote = run("git remote get-url origin", workspacePath);
  if (remote) {
    const parts = remote.split("/");
    return parts[parts.length - 1].replace(".git", "");
  }
  return path.basename(workspacePath);
}
