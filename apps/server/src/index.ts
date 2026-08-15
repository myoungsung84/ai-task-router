import { config } from "./config";
import { createApp } from "./server/app";
import { taskStore } from "./tasks/task-store";

taskStore.init();

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
