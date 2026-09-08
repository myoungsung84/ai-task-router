import assert from "node:assert/strict";
import { it } from "node:test";
import { accountSchema, limitsSchema } from "./codex-account";

it("기간이 다른 한도를 분리하고 정상 0%를 보존한다", () => {
  const main = {
    limitId: "codex",
    limitName: null,
    primary: { usedPercent: 2, windowDurationMins: 10080, resetsAt: 2000000000 },
    secondary: null,
  };
  const other = {
    ...main,
    limitId: "other",
    primary: { ...main.primary, usedPercent: 0, windowDurationMins: 300 },
  };
  const result = limitsSchema.parse({
    rateLimits: main,
    rateLimitsByLimitId: { codex: main, other },
  });
  assert.equal(result.rateLimitsByLimitId?.codex?.primary?.windowDurationMins, 10080);
  assert.equal(result.rateLimitsByLimitId?.other?.primary?.usedPercent, 0);
  assert.equal(result.rateLimitsByLimitId?.other?.primary?.windowDurationMins, 300);
});

it("로그아웃과 잘못된 한도 응답은 검증에 실패한다", () => {
  assert.equal(accountSchema.safeParse({ account: null }).success, false);
  assert.equal(
    limitsSchema.safeParse({ rateLimits: { primary: { usedPercent: "0" } } }).success,
    false,
  );
});
