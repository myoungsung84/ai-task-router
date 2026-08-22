import { Router } from "express";
import { computeDailySummary, todayInKst } from "./daily-summary-service";

export const dailySummaryRouter = Router();

/** `GET /api/history/daily?date=YYYY-MM-DD` — defaults to today (Asia/Seoul) when `date` is omitted. */
dailySummaryRouter.get("/daily", (req, res) => {
  const date =
    typeof req.query.date === "string" && req.query.date.trim() ? req.query.date : todayInKst();
  res.json(computeDailySummary(date));
});
