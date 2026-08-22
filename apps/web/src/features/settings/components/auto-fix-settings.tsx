"use client";

import { useEffect, useState } from "react";
import { useSettings } from "../hooks/use-settings";
import { Button } from "@/components/button";
import { LoadingState, ErrorState } from "@/components/states";
import { Alert } from "@/components/alert";
import { useToast } from "@/components/toast";

const MIN_LOOPS = 1;
const MAX_LOOPS = 10;

/**
 * Auto Review/Fix Loop — a global on/off toggle plus its loop cap, mirroring
 * `RoleSettings`' own "stage locally, save once" pattern. Off by default:
 * when off, a WARNING Task behaves exactly as before this feature existed
 * (a person creates the follow-up manually from Task Detail).
 */
export function AutoFixSettings() {
  const { settings, loading, error, updateAutoFix, refresh } = useSettings();
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [maxLoops, setMaxLoops] = useState(2);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (settings && !initialized) {
      setEnabled(settings.autoFixEnabled);
      setMaxLoops(settings.maxReviewLoops);
      setInitialized(true);
    }
  }, [settings, initialized]);

  if (loading) return <LoadingState label="설정을 불러오는 중" />;
  if (error || !settings) {
    return <ErrorState message={error ?? "설정을 불러오지 못했습니다."} onRetry={refresh} />;
  }

  const dirty = enabled !== settings.autoFixEnabled || maxLoops !== settings.maxReviewLoops;
  const validLoops = Number.isInteger(maxLoops) && maxLoops >= MIN_LOOPS && maxLoops <= MAX_LOOPS;

  async function onSave() {
    if (!validLoops) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateAutoFix({ autoFixEnabled: enabled, maxReviewLoops: maxLoops });
      showToast("success", "설정을 저장했습니다.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-fg">Auto Review/Fix Loop</h2>
        <p className="text-sm text-fg-muted">
          리뷰가 WARNING이면 Security 이슈나 요구사항 확인이 필요한 경우, 위험한 변경이 필요한
          경우를 제외하고 자동으로 수정 후 재검토를 반복합니다.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded-sm accent-brand"
          />
          <span>
            <span className="block font-medium text-fg">자동 수정 활성화</span>
            <span className="mt-0.5 block text-xs text-fg-muted">
              기본값은 꺼짐입니다. 꺼져 있으면 지금까지처럼 사람이 직접 후속 작업을 만듭니다.
            </span>
          </span>
        </label>

        <label className="flex items-center gap-3 text-sm">
          <span className="text-fg-secondary">최대 자동 수정 횟수</span>
          <input
            type="number"
            min={MIN_LOOPS}
            max={MAX_LOOPS}
            value={maxLoops}
            onChange={(e) => setMaxLoops(Number(e.target.value))}
            className="mono w-16 rounded-md border border-border bg-transparent px-2 py-1 text-sm"
          />
          <span className="text-xs text-fg-muted">
            {MIN_LOOPS}~{MAX_LOOPS}회 (초과하면 확인 필요로 표시)
          </span>
        </label>

        <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
          <span className="text-xs text-fg-muted">
            {!validLoops
              ? "1~10 사이의 정수를 입력하세요"
              : dirty
                ? "저장하지 않은 변경 사항이 있습니다"
                : "변경 사항 없음"}
          </span>
          <Button
            size="sm"
            onClick={onSave}
            loading={saving}
            disabled={(!dirty && !saving) || !validLoops}
          >
            저장
          </Button>
        </div>
      </div>

      {saveError ? <Alert tone="danger">{saveError}</Alert> : null}
    </section>
  );
}
