import { config } from "./config";
import { createApp } from "./server/app";
import { taskStore } from "./tasks/task-store";
import { recoverInterruptedTasks } from "./tasks/recover-interrupted";
import { discussionService } from "./discussions/discussion-service";

taskStore.init();

// Anything still marked RUNNING/REVIEWING belongs to a previous process whose
// children died with it — see recover-interrupted.ts. Without this they stay in
// that state permanently, and can be neither cancelled nor deleted.
const { recovered } = recoverInterruptedTasks();
if (recovered.length > 0) {
  console.warn(
    `[server] 이전 실행이 중단된 Task ${recovered.length}건을 실패 처리했습니다: ${recovered.join(", ")}`,
  );
}

// Discussion documents are append-only files; nothing needs recovering the way
// an interrupted Task does, because nothing was left in a state that lies. The
// schedule that *was* lost — whose turn it was — is memory by design, and a
// room whose round was cut short says 재개 필요 rather than resuming on its own.
discussionService.init();

const app = createApp();

app.listen(config.port, () => {
  console.log(`[server] http://localhost:${config.port}`);
  console.log(`[mcp] http://localhost:${config.port}/mcp`);
  console.log(`[ai-task-router server] data dir: ${config.dataDir}`);
});

process.on("uncaughtException", (err) => {
  console.error("[server] uncaught exception:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[server] unhandled rejection:", err);
});
