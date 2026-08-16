"use client";

import { useCallback, useEffect, useState } from "react";
import type { RoleSettings, Settings } from "@ai-task-router/shared";
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

  const updateRoles = useCallback(async (roles: RoleSettings) => {
    const updated = await settingsApi.updateRoles(roles);
    setSettings(updated);
    return updated;
  }, []);

  return { settings, loading, error, refresh, updateRoles };
}
