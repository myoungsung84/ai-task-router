"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { tasksApi } from "../api/tasks-api";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { cn } from "@/lib/format";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-[#c8d1db]">{label}</div>
      {children}
      {hint ? <div className="mt-1 text-xs text-[#8291a3]">{hint}</div> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-[#232c38] bg-[#0e131a] px-3 py-2 text-sm text-white placeholder:text-[#546274] focus:border-blue-500 focus:outline-none";

export function TaskCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [instruction, setInstruction] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [branch, setBranch] = useState("");
  const [autoStart, setAutoStart] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const task = await tasksApi.create({
        title,
        projectPath,
        instruction,
        baseBranch: baseBranch || null,
        branch: branch || null,
      });
      if (autoStart) {
        try {
          await tasksApi.start(task.id);
        } catch (startErr) {
          // Task was created even if start failed (e.g. same-project busy) —
          // send the user to the detail page where the error/state is visible.
          console.warn("자동 시작 실패:", startErr);
        }
      }
      router.push(`/tasks/${task.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <Card title="새 Task 생성">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="제목">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: Backend 회원 탈퇴 API"
            required
          />
        </Field>

        <Field
          label="프로젝트 경로"
          hint="Claude/Codex가 실행될 로컬 디렉터리 (Git 저장소여야 합니다)"
        >
          <input
            className={cn(inputClass, "mono")}
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            placeholder="D:\01.src\company\backend"
            required
          />
        </Field>

        <Field label="작업 지시사항 (Claude에게 전달됨)">
          <textarea
            className={cn(inputClass, "min-h-[120px]")}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="예: 회원 탈퇴 API를 추가해줘. 소프트 삭제로 처리하고 관련 테스트도 추가해줘."
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="baseBranch" hint="branch가 새로 생성될 때만 사용">
            <input
              className={cn(inputClass, "mono")}
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="main"
            />
          </Field>
          <Field label="branch" hint="비워두면 현재 브랜치에서 작업">
            <input
              className={cn(inputClass, "mono")}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feature/withdraw-api"
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-[#c8d1db]">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => setAutoStart(e.target.checked)}
          />
          생성 후 즉시 실행
        </label>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "생성 중..." : autoStart ? "생성 및 실행" : "생성"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
