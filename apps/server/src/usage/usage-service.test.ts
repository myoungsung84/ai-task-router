import assert from "node:assert/strict";
import { it } from "node:test";
import type { AgentUsage } from "@ai-task-router/shared";
import { verifiedUsage } from "./usage-service";

const usage: AgentUsage = {
  agent: "codex",
  account: { email: null, plan: "Prolite", organization: null },
  accountMatch: "UNVERIFIABLE",
  primary: {
    usedPercent: 0,
    remainingPercent: 100,
    windowMinutes: 10080,
    resetsAt: "2026-09-15T00:00:00Z",
    expired: false,
  },
  secondary: null,
  todayTokens: 123,
  todayTokensScope: "LOCAL_ALL_SESSIONS",
  observedAt: "2026-09-08T00:00:00Z",
  unavailable: null,
};

it("계정 미확인·불일치 기록의 한도와 Codex 요금제를 숨긴다", () => {
  for (const accountMatch of ["MISMATCHED"] as const) {
    const result = verifiedUsage({ ...usage, accountMatch });
    assert.equal(result.primary, null);
    assert.equal(result.secondary, null);
    assert.equal(result.observedAt, null);
    assert.equal(result.account?.plan, null);
    assert.match(result.unavailable ?? "", /계정 사용량 미확인/);
    assert.equal(result.todayTokens, 123);
  }
});

it("계정이 확인된 0% 기록은 그대로 유지한다", () => {
  const verified: AgentUsage = { ...usage, accountMatch: "VERIFIED" };
  assert.equal(verifiedUsage(verified), verified);
});

it("계정 미확인 Codex는 계정 표시를 제거하고 로컬 한도 기록을 보존한다", () => {
  const result = verifiedUsage(usage);
  assert.equal(result.account, null);
  assert.equal(result.primary, usage.primary);
  assert.equal(result.accountMatch, "UNVERIFIABLE");
});
