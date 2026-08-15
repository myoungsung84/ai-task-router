import { execFile } from "node:child_process";
import fs from "node:fs";
import type { ChangedFile, TaskGitInfo } from "@ai-task-router/shared";

export class GitError extends Error {}

function runGit(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    // execFile, never a shell string — args are passed as a real argv array,
    // so nothing in a branch name / path can be interpreted as shell syntax.
    execFile(
      "git",
      args,
      { cwd, windowsHide: true, maxBuffer: 1024 * 1024 * 32 },
      (err, stdout, stderr) => {
        const code = (err as NodeJS.ErrnoException & { code?: number })?.code;
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          code: typeof code === "number" ? code : err ? 1 : 0,
        });
      },
    );
  });
}

export function projectPathExists(projectPath: string): boolean {
  try {
    return fs.statSync(projectPath).isDirectory();
  } catch {
    return false;
  }
}

export async function isGitRepository(projectPath: string): Promise<boolean> {
  const res = await runGit(["rev-parse", "--is-inside-work-tree"], projectPath);
  return res.code === 0 && res.stdout.trim() === "true";
}

export async function getCurrentBranch(projectPath: string): Promise<string | null> {
  const res = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], projectPath);
  if (res.code !== 0) return null;
  const branch = res.stdout.trim();
  return branch === "HEAD" ? null : branch; // null = detached HEAD
}

export async function hasUncommittedChanges(projectPath: string): Promise<boolean> {
  const res = await runGit(["status", "--porcelain"], projectPath);
  return res.stdout.trim().length > 0;
}

export async function branchExists(projectPath: string, branch: string): Promise<boolean> {
  const res = await runGit(
    ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    projectPath,
  );
  return res.code === 0;
}

export async function getStatusPorcelain(projectPath: string): Promise<string> {
  const res = await runGit(["status", "--porcelain"], projectPath);
  return res.stdout;
}

export async function getChangedFiles(projectPath: string): Promise<ChangedFile[]> {
  const raw = await getStatusPorcelain(projectPath);
  return raw
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2).trim();
      const filePath = line.slice(3).trim();
      return { status: status || "?", path: filePath };
    });
}

/** Diff of tracked working-tree changes (staged + unstaged) against HEAD. */
export async function getDiff(projectPath: string): Promise<string> {
  const res = await runGit(["diff", "HEAD"], projectPath);
  return res.stdout;
}

/**
 * Verify the project path + git state, then resolve/create the working
 * branch as requested. Never uses --hard reset, clean -fd, checkout -f,
 * push, merge, or rebase. If the checkout would conflict with existing
 * uncommitted changes, git itself refuses and we surface that as an error
 * rather than forcing anything.
 */
export async function prepareGitState(
  projectPath: string,
  baseBranch: string | null,
  branch: string | null,
): Promise<{ info: TaskGitInfo; logLines: string[] }> {
  const logLines: string[] = [];

  if (!projectPathExists(projectPath)) {
    throw new GitError(`프로젝트 경로를 찾을 수 없습니다: ${projectPath}`);
  }
  if (!(await isGitRepository(projectPath))) {
    throw new GitError(`Git 저장소가 아닙니다: ${projectPath}`);
  }

  const originalBranch = await getCurrentBranch(projectPath);
  const hadUncommittedChangesBeforeStart = await hasUncommittedChanges(projectPath);

  logLines.push(`현재 브랜치: ${originalBranch ?? "(detached HEAD)"}`);
  if (hadUncommittedChangesBeforeStart) {
    logLines.push(
      "⚠ 기존 working tree에 커밋되지 않은 변경사항이 있습니다. 삭제/초기화하지 않고 그대로 둔 채 진행합니다.",
    );
  } else {
    logLines.push("working tree clean 상태를 확인했습니다.");
  }

  const info: TaskGitInfo = {
    originalBranch,
    requestedBaseBranch: baseBranch,
    requestedBranch: branch,
    resolvedBranch: originalBranch,
    branchCreated: false,
    hadUncommittedChangesBeforeStart,
  };

  if (!branch) {
    logLines.push("branch가 지정되지 않아 현재 브랜치에서 작업합니다.");
    return { info, logLines };
  }

  const exists = await branchExists(projectPath, branch);

  if (exists) {
    if (branch !== originalBranch) {
      logLines.push(`기존 브랜치 '${branch}'로 전환합니다.`);
      const res = await runGit(["checkout", branch], projectPath);
      if (res.code !== 0) {
        throw new GitError(
          `브랜치 '${branch}'로 전환하지 못했습니다 (충돌 가능성). git 메시지: ${res.stderr.trim()}`,
        );
      }
    } else {
      logLines.push(`이미 브랜치 '${branch}'에 있습니다.`);
    }
    info.resolvedBranch = branch;
    return { info, logLines };
  }

  // Branch doesn't exist yet — create it.
  if (baseBranch) {
    const baseExists = await branchExists(projectPath, baseBranch);
    if (!baseExists) {
      throw new GitError(`baseBranch '${baseBranch}'가 존재하지 않습니다.`);
    }
    logLines.push(`baseBranch '${baseBranch}'에서 새 브랜치 '${branch}'를 생성합니다.`);
    const res = await runGit(["checkout", "-b", branch, baseBranch], projectPath);
    if (res.code !== 0) {
      throw new GitError(
        `브랜치 '${branch}' 생성에 실패했습니다. git 메시지: ${res.stderr.trim()}`,
      );
    }
  } else {
    logLines.push(`현재 브랜치에서 새 브랜치 '${branch}'를 생성합니다.`);
    const res = await runGit(["checkout", "-b", branch], projectPath);
    if (res.code !== 0) {
      throw new GitError(
        `브랜치 '${branch}' 생성에 실패했습니다. git 메시지: ${res.stderr.trim()}`,
      );
    }
  }

  info.resolvedBranch = branch;
  info.branchCreated = true;
  return { info, logLines };
}
