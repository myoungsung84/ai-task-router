import { config } from "./config";
import { createApp } from "./server/app";
import { taskStore } from "./tasks/task-store";
import { recoverInterruptedTasks } from "./tasks/recover-interrupted";

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
