import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveWorkflowSpecForPurpose, type RoleSettings } from "@ai-task-router/shared";
import { parseRoles } from "./settings-service";

/**
 * That a chosen model survives all the way to the CLI argument.
 *
 * The picker stores a string, Settings validates it, the purpose resolver
 * turns it into Steps, and the runner appends it to argv. Nothing along that
 * path may substitute a different model for one it does not recognize, so the
 * newly added cards ("fable", "gpt-6-astra") need no server-side registration
 * to work — and this pins that, because the moment something starts
 * validating against a list, an unlisted model becomes a silent downgrade.
 */
function rolesWith(model: string | null): RoleSettings {
  return {
    implementer: { agent: "claude", model },
    analyzer: { agent: "claude", model },
    reviewer: { agent: "codex", model: "gpt-6-astra" },
  };
}

describe("모델 선택값 전달", () => {
  it("구현·리뷰 담당의 모델이 Step 까지 그대로 간다", () => {
    const spec = resolveWorkflowSpecForPurpose("implement", rolesWith("fable"));

    assert.deepEqual(
      spec.steps.map((s) => [s.agent, s.action, s.model]),
      [
        ["claude", "implement", "fable"],
        ["codex", "review", "gpt-6-astra"],
      ],
    );
  });

  it("리뷰 전용 목적에서도 리뷰 담당 모델이 유지된다", () => {
    const spec = resolveWorkflowSpecForPurpose("review", rolesWith(null));

    assert.equal(spec.steps.length, 1);
    assert.equal(spec.steps[0]?.model, "gpt-6-astra");
  });

  it("작업별 override 가 그 Step 의 모델만 바꾼다", () => {
    const spec = resolveWorkflowSpecForPurpose("implement", rolesWith("sonnet"), {
      implementer: { agent: "claude", model: "fable" },
    });

    assert.equal(spec.steps[0]?.model, "fable");
    assert.equal(spec.steps[1]?.model, "gpt-6-astra");
  });

  it("자동 선택(null)은 override 로도 값이 아니라 null 로 유지된다", () => {
    // null 은 "모델 플래그를 붙이지 않는다" 는 실제 설정이지 값의 부재가 아니다.
    const spec = resolveWorkflowSpecForPurpose("analyze", rolesWith("opus"), {
      analyzer: { agent: "claude", model: null },
    });

    assert.equal(spec.steps[0]?.model, null);
  });
});

describe("모델 설정 저장", () => {
  it("카탈로그에 없는 모델도 거부하거나 대체하지 않는다", () => {
    // 서버는 목록을 갖고 있지 않다. 새 모델이 나올 때마다 서버를 고쳐야 한다면
    // 사용자는 설치된 CLI 가 이미 받는 모델을 쓸 수 없게 된다.
    const saved = parseRoles({
      implementer: { agent: "claude", model: "claude-fable-5-1[1m]" },
      analyzer: { agent: "claude", model: "fable" },
      reviewer: { agent: "codex", model: "gpt-6-astra" },
    });

    assert.equal(saved.implementer.model, "claude-fable-5-1[1m]");
    assert.equal(saved.analyzer.model, "fable");
    assert.equal(saved.reviewer.model, "gpt-6-astra");
  });

  it("공백만 있는 모델은 자동 선택(null)으로 저장된다", () => {
    const saved = parseRoles({
      implementer: { agent: "claude", model: "   " },
      analyzer: { agent: "claude", model: null },
      reviewer: { agent: "codex" },
    });

    assert.equal(saved.implementer.model, null);
    assert.equal(saved.analyzer.model, null);
    assert.equal(saved.reviewer.model, null);
  });
});
