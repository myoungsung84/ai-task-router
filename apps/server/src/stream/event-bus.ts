import { EventEmitter } from "node:events";
import type { TaskEvent } from "@ai-task-router/shared";

/**
 * One EventEmitter per task id, created lazily. SSE handlers subscribe here;
 * the executor publishes here. Kept as a small in-memory registry — no
 * pub/sub library needed for a single-process local tool.
 */
class TaskEventBus {
  private emitters = new Map<string, EventEmitter>();

  private getOrCreate(taskId: string): EventEmitter {
    let em = this.emitters.get(taskId);
    if (!em) {
      em = new EventEmitter();
      em.setMaxListeners(50);
      this.emitters.set(taskId, em);
    }
    return em;
  }

  publish(taskId: string, event: TaskEvent): void {
    this.getOrCreate(taskId).emit("event", event);
  }

  subscribe(taskId: string, handler: (event: TaskEvent) => void): () => void {
    const em = this.getOrCreate(taskId);
    em.on("event", handler);
    return () => em.off("event", handler);
  }

  /** Drop the emitter once a task is terminal and has no listeners left. */
  dispose(taskId: string): void {
    const em = this.emitters.get(taskId);
    if (em && em.listenerCount("event") === 0) {
      this.emitters.delete(taskId);
    }
  }
}

export const taskEventBus = new TaskEventBus();
