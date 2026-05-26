import { getCurrentUserFromRequest, getCurrentUser } from "@/lib/auth";
import { corsOptions } from "@/lib/cors";
import { getAll, getOne } from "@/lib/db";
import { ok } from "@/lib/http";
import { notExpiredSql, purgeExpiredRewriteData, TASK_RETENTION_HOURS } from "@/lib/retention";

export async function GET(request: Request) {
  purgeExpiredRewriteData();
  const user = getCurrentUserFromRequest(request) || await getCurrentUser();
  if (!user) {
    return ok({ user: null }, request);
  }

  const today = new Date().toISOString().slice(0, 10);
  const free = getOne<{ used_count: number }>(
    "SELECT used_count FROM free_daily WHERE user_id = ? AND day = ?",
    user.id,
    today,
  );
  const usage = getAll(
    `SELECT id, mode, source_type, input_chars, cost_points, used_free, status, error, created_at, finished_at
     FROM rewrite_tasks
     WHERE user_id = ? AND ${notExpiredSql()}
     ORDER BY created_at DESC
     LIMIT 20`,
    user.id,
  );
  const credits = getAll(
    `SELECT change_points, balance_after, type, note, created_at
     FROM credit_logs
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    user.id,
  );

  return ok({
    user,
    accountExpired: Boolean(user.role !== "admin" && user.role !== "public" && user.expires_at && new Date(user.expires_at).getTime() < Date.now()),
    freeUsedToday: free?.used_count || 0,
    usage,
    credits,
    retentionHours: TASK_RETENTION_HOURS,
  }, request);
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
