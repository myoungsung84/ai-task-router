import { Router, type Request, type Response, type NextFunction } from "express";
import { validateProjectPath } from "./project-validator";
import { getRecentProjects, getLastWorkflowForProject } from "./project-memory-store";
import { isGitRepository } from "../git/git-manager";

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

export const projectRouter = Router();

/** Recently-used project paths, most-recent-first — backs the New Task dialog's "다시 선택" list. */
projectRouter.get("/recent", (_req, res) => {
  res.json(getRecentProjects());
});

/**
 * Live existence/Git-repo check for the New Task dialog's project path
 * field, piggybacking this project's remembered Workflow (if any) onto the
 * same response so the dialog doesn't need a second round-trip. Informational
 * only — Task creation itself still only requires the path to exist (see
 * taskService.createTask), so a "대기열에 추가" Task for a not-yet-ready path
 * is still allowed.
 */
projectRouter.get(
  "/validate",
  asyncHandler(async (req, res) => {
    const raw = req.query.path;
    const projectPath = typeof raw === "string" ? raw : "";
    const validation = validateProjectPath(projectPath);
    if (!validation.ok || !validation.normalizedPath) {
      res.json({ ok: false, exists: false, isGitRepo: false, error: validation.error });
      return;
    }
    const isGitRepo = await isGitRepository(validation.normalizedPath);
    res.json({
      ok: isGitRepo,
      exists: true,
      isGitRepo,
      normalizedPath: validation.normalizedPath,
      lastWorkflow: getLastWorkflowForProject(validation.normalizedPath),
      error: isGitRepo ? undefined : "Git 저장소가 아닙니다.",
    });
  }),
);
