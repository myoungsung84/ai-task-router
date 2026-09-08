#!/usr/bin/env node
/**
 * `pnpm start` — run the server and the web app from built output, with no
 * watcher and no hot reload.
 *
 * `pnpm dev` stays what it was. This exists for leaving the dashboard running:
 * a watcher restarts the server whenever a file is touched, which in the
 * middle of a Task means the run loses its child processes.
 *
 * Two things it does that `pnpm --parallel -r run start` does not:
 *
 * 1. Checks the build output first and names the command to produce it.
 *    `next start` without a build fails with its own message about a missing
 *    production build, and `node dist/index.js` with an ENOENT stack — neither
 *    of which says "run pnpm build".
 * 2. Never leaves one half running. If either process fails to start or exits,
 *    the other is torn down. A stranded `next start` holds port 9913 and the
 *    next attempt then fails for a reason that has nothing to do with the
 *    actual problem.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Build output that must exist, and the command that produces it. */
const REQUIRED = [
  {
    file: "packages/shared/dist/index.js",
    label: "공용 타입(@ai-task-router/shared)",
    command: "pnpm --filter @ai-task-router/shared build",
  },
  {
    file: "apps/server/dist/index.js",
    label: "서버",
    command: "pnpm build:server",
  },
  {
    // Next writes BUILD_ID only on a completed production build, so it is the
    // honest marker. A bare `.next/` directory also exists after `pnpm dev`,
    // and `next start` cannot use that.
    file: "apps/web/.next/BUILD_ID",
    label: "웹",
    command: "pnpm build:web",
  },
];

function missingArtifacts() {
  return REQUIRED.filter((entry) => !fs.existsSync(path.join(ROOT, entry.file)));
}

function reportMissing(missing) {
  console.error("빌드 결과가 없어 시작할 수 없습니다.\n");
  for (const entry of missing) {
    console.error(`  - ${entry.label}: ${entry.file}`);
  }
  console.error("\n전체를 한 번에 빌드하려면:\n");
  console.error("  pnpm install   # 최초 1회 (packages/shared 를 함께 빌드합니다)");
  console.error("  pnpm build\n");
  console.error("일부만 다시 빌드하려면:\n");
  for (const entry of missing) {
    console.error(`  ${entry.command}`);
  }
  console.error("");
}

const PROCESSES = [
  { name: "server", args: ["--filter", "@ai-task-router/server", "start"] },
  { name: "web", args: ["--filter", "@ai-task-router/web", "start"] },
];

/**
 * Kills a child and everything it started.
 *
 * `detached: true` above puts each child in its own process group, which is
 * the point: `pnpm start` is a wrapper that spawns `node`/`next`, so
 * signalling only the pnpm process leaves the real server alive and holding
 * its port.
 */
function killTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }).on(
      "error",
      () => {},
    );
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
}

function main() {
  const missing = missingArtifacts();
  if (missing.length > 0) {
    reportMissing(missing);
    process.exitCode = 1;
    return;
  }

  const children = [];
  let shuttingDown = false;

  /** First exit wins: whoever stops first decides the exit code, and the rest are torn down. */
  const shutdown = (code, reason) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (reason) console.error(`\n${reason}`);
    for (const child of children) killTree(child);
    process.exitCode = code;
  };

  for (const proc of PROCESSES) {
    const child = spawn("pnpm", proc.args, {
      cwd: ROOT,
      stdio: "inherit",
      detached: process.platform !== "win32",
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "production" },
    });

    child.on("error", (err) => {
      shutdown(1, `${proc.name} 를 실행하지 못했습니다: ${err.message}`);
    });

    child.on("exit", (code, signal) => {
      if (shuttingDown) return;
      shutdown(
        code ?? 1,
        signal
          ? `${proc.name} 가 ${signal} 로 종료됐습니다. 나머지 프로세스도 정리합니다.`
          : `${proc.name} 가 종료됐습니다 (exit ${String(code)}). 나머지 프로세스도 정리합니다.`,
      );
    });

    children.push(child);
  }

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => shutdown(0, "종료합니다."));
  }
}

main();
