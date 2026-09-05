import { Router } from "express";
import { getUsageSnapshot } from "./usage-service";

export const usageRouter = Router();

/** `GET /api/usage` — both CLIs' plan limits and today's token totals. */
usageRouter.get("/", (_req, res) => {
  void getUsageSnapshot()
    .then((snapshot) => res.json(snapshot))
    .catch(() => {
      // The collectors already degrade to `unavailable` per agent, so reaching
      // here means something outside them broke. The panel is an accessory —
      // it fails on its own rather than taking the dashboard's fetch with it.
      res.status(500).json({ error: "사용량을 읽지 못했습니다" });
    });
});
