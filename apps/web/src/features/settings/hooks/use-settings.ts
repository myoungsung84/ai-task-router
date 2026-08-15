"use client";

import { useCallback, useEffect, useState } from "react";
import type { Settings, WorkflowSpec } from "@ai-task-router/shared";
import { settingsApi } from "../api/settings-api";

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSettings(await settingsApi.get());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateDefaultWorkflow = useCallback(async (workflow: WorkflowSpec) => {
    const updated = await settingsApi.updateDefaultWorkflow(workflow);
    setSettings(updated);
    return updated;
  }, []);

  return { settings, loading, error, refresh, updateDefaultWorkflow };
}
