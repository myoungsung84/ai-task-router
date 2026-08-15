import { Router, type Request, type Response, type NextFunction } from "express";
import { settingsService, SettingsServiceError } from "./settings-service";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  res.json(settingsService.get());
});

settingsRouter.put(
  "/default-workflow",
  (req: Request<unknown, unknown, { defaultWorkflow?: unknown }>, res) => {
    const updated = settingsService.updateDefaultWorkflow(req.body?.defaultWorkflow);
    res.json(updated);
  },
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
settingsRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SettingsServiceError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error("[settings-routes] unexpected error:", err);
  res.status(500).json({ error: "서버 내부 오류가 발생했습니다." });
});
