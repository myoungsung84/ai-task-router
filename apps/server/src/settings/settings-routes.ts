import { Router, type Request, type Response, type NextFunction } from "express";
import { settingsService, SettingsServiceError } from "./settings-service";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  res.json(settingsService.get());
});

/** Saves the 구현/분석/리뷰 Role cards from the Settings screen — see settingsService.updateRoles. */
settingsRouter.put("/roles", (req: Request<unknown, unknown, { roles?: unknown }>, res) => {
  const updated = settingsService.updateRoles(req.body?.roles);
  res.json(updated);
});

/** Saves the Auto Review/Fix Loop toggle + its loop cap — see settingsService.updateAutoFix. */
settingsRouter.put("/auto-fix", (req: Request, res) => {
  const updated = settingsService.updateAutoFix(req.body);
  res.json(updated);
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
settingsRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SettingsServiceError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error("[settings-routes] unexpected error:", err);
  res.status(500).json({ error: "서버 내부 오류가 발생했습니다." });
});
