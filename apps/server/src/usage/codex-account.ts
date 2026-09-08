import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { z } from "zod";
import { config } from "../config";

const windowSchema = z.object({
  usedPercent: z.number().finite().min(0).max(100),
  windowDurationMins: z.number().positive().nullable(),
  resetsAt: z.number().finite().nullable(),
});
const limitSchema = z.object({
  limitId: z.string().nullable(),
  limitName: z.string().nullable(),
  primary: windowSchema.nullable(),
  secondary: windowSchema.nullable(),
});
export const accountSchema = z.object({
  account: z.object({ type: z.literal("chatgpt"), email: z.string(), planType: z.string() }),
});
export const limitsSchema = z.object({
  rateLimits: limitSchema,
  rateLimitsByLimitId: z.record(z.string(), limitSchema).nullish(),
});

export async function readCodexAccount(): Promise<{
  account: z.infer<typeof accountSchema>["account"];
  limits: z.infer<typeof limitsSchema>;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.codexBin, ["app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "ignore"],
    });
    const lines = createInterface({ input: child.stdout });
    let finished = false;
    let account: z.infer<typeof accountSchema>["account"] | undefined;
    const finish = (result?: {
      account: z.infer<typeof accountSchema>["account"];
      limits: z.infer<typeof limitsSchema>;
    }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.end();
      child.kill();
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
      killTimer.unref();
      child.once("close", () => clearTimeout(killTimer));
      if (result) resolve(result);
      else reject(new Error("Codex 계정·한도 조회에 실패했습니다"));
    };
    const timer = setTimeout(() => finish(), 15000);
    const send = (value: object) => child.stdin.write(`${JSON.stringify(value)}\n`);
    child.on("error", () => finish());
    child.stdin.on("error", () => finish());
    child.on("exit", () => finish());
    lines.on("line", (line) => {
      try {
        const message = z
          .object({
            id: z.number().optional(),
            result: z.unknown().optional(),
            error: z.unknown().optional(),
          })
          .parse(JSON.parse(line));
        if (message.error) return finish();
        if (message.id === 1) {
          send({ method: "initialized" });
          send({ id: 2, method: "account/read", params: { refreshToken: false } });
        } else if (message.id === 2) {
          account = accountSchema.parse(message.result).account;
          send({ id: 3, method: "account/rateLimits/read" });
        } else if (message.id === 3 && account) {
          finish({ account, limits: limitsSchema.parse(message.result) });
        }
      } catch {
        finish();
      }
    });
    send({
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "usage_panel", version: "1.0.0" } },
    });
  });
}
