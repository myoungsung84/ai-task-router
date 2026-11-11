import assert from "node:assert/strict";
import childProcess, { ChildProcess } from "node:child_process";
import { it } from "node:test";
import type { StepPermission } from "@ai-task-router/shared";
import { config } from "../../config";
import { runClaudeStep } from "./claude-runner";

const cases: {
  name: string;
  permission: StepPermission;
  override: string;
  expectedModeArgs: string[];
}[] = [
  {
    name: "쓰기 작업은 재정의가 없으면 Claude 권한 설정을 유지한다",
    permission: "write",
    override: "",
    expectedModeArgs: [],
  },
  {
    name: "쓰기 작업은 명시한 권한 모드를 전달한다",
    permission: "write",
    override: "auto",
    expectedModeArgs: ["--permission-mode", "auto"],
  },
  {
    name: "읽기 전용 작업은 쓰기 권한 재정의가 있어도 plan을 유지한다",
    permission: "read-only",
    override: "acceptEdits",
    expectedModeArgs: ["--permission-mode", "plan"],
  },
];

for (const scenario of cases) {
  it(scenario.name, async (t) => {
    const originalBin = config.claudeBin;
    const originalMode = config.claudePermissionMode;
    t.after(() => {
      config.claudeBin = originalBin;
      config.claudePermissionMode = originalMode;
    });
    config.claudeBin = process.execPath;
    config.claudePermissionMode = scenario.override;

    const child = new ChildProcess();
    const spawn = t.mock.method(childProcess, "spawn", () => child);
    const prompt = "공백과 '따옴표', $(명령)을 포함한 지시";
    const run = runClaudeStep(
      "implement",
      scenario.permission,
      "test-model",
      prompt,
      "권한 설정 검증",
      process.cwd(),
      () => {},
    );
    child.emit("close", 0);

    assert.equal((await run.result).success, true);
    assert.equal(spawn.mock.callCount(), 1);
    const call = spawn.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[0], process.execPath);
    assert.deepEqual(call.arguments[1], [
      "-p",
      prompt,
      ...scenario.expectedModeArgs,
      "--model",
      "test-model",
    ]);
  });
}
