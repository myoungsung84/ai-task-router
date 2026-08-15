export interface NotifyPayload {
  title: string;
  message: string;
}

export interface Notifier {
  notify(payload: NotifyPayload): void;
}

/** Just the slice of node-notifier's API this file actually calls. */
interface NodeNotifierModule {
  notify(opts: Record<string, unknown>): void;
}

/**
 * Windows toast notifications via node-notifier (SnoreToast under the hood).
 * Wrapped so that a broken/missing notification backend can never take the
 * task pipeline down with it — worst case we just log and move on.
 */
class WindowsNotifier implements Notifier {
  private backend: NodeNotifierModule | null = null;
  private failed = false;

  private load() {
    if (this.backend || this.failed) return;
    try {
      // Lazy require (rather than a static import): keeps a broken/absent
      // native dependency from crashing the server at import time. `require`
      // has no type info of its own, so the module shape is asserted here —
      // the one boundary where we trust node-notifier's own published API.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.backend = require("node-notifier") as NodeNotifierModule;
    } catch (err) {
      this.failed = true;
      console.warn("[notifier] node-notifier를 불러오지 못했습니다. 알림을 건너뜁니다.", err);
    }
  }

  notify(payload: NotifyPayload): void {
    this.load();
    if (!this.backend) return;
    try {
      this.backend.notify({
        title: payload.title,
        message: payload.message,
        appID: "ai-task-router",
        sound: false,
        wait: false,
      });
    } catch (err) {
      console.warn("[notifier] 알림 표시 중 오류가 발생했습니다.", err);
    }
  }
}

class NoopNotifier implements Notifier {
  notify(): void {
    // intentionally does nothing — fallback for non-Windows/CI environments
  }
}

export const notifier: Notifier =
  process.platform === "win32" ? new WindowsNotifier() : new NoopNotifier();
