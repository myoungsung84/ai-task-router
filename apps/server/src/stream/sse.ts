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
  const identifier = req.params.id;
  if (!identifier) {
    res.status(400).json({ error: "id 파라미터가 없습니다." });
    return;
  }
  // Accepts either the UUID or the Job ID (e.g. "T-1042"), same as every
  // other lookup — but the event bus itself is always keyed by the UUID
  // (that's what task-executor.ts publishes under), so resolve once here.
  const task = taskStore.resolve(identifier);
  if (!task) {
    res.status(404).json({ error: "Task를 찾을 수 없습니다." });
    return;
  }
  const id = task.id;

  res.writeHead(200, {
    // charset=utf-8 explicit: the EventSource spec already mandates UTF-8
    // decoding regardless, but this removes any ambiguity for other clients.
    "Content-Type": "text/event-stream; charset=utf-8",
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
