import type { Request, Response } from "express";
import type { TaskEvent } from "@ai-task-router/shared";
import { taskStore } from "../tasks/task-store";
import { taskEventBus } from "./event-bus";

function writeEvent(res: Response, event: TaskEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * SSE stream for one task. Sends a full snapshot first (so a page refresh
 * immediately shows everything collected so far, including past logs),
 * then live log/status events as they happen.
 */
export function taskEventsHandler(req: Request, res: Response): void {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "id 파라미터가 없습니다." });
    return;
  }
  const task = taskStore.get(id);
  if (!task) {
    res.status(404).json({ error: "Task를 찾을 수 없습니다." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  writeEvent(res, { type: "task", task });

  const unsubscribe = taskEventBus.subscribe(id, (event) => {
    writeEvent(res, event);
  });

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    taskEventBus.dispose(id);
  });
}
