import { requireAdminFromRequest } from "@/lib/auth";
import { corsOptions } from "@/lib/cors";
import { getAll, getOne } from "@/lib/db";
import { fail, ok, errorMessage } from "@/lib/http";
import { notExpiredSql, purgeExpiredRewriteData } from "@/lib/retention";

export async function GET(request: Request) {
  try {
    purgeExpiredRewriteData();
    await requireAdminFromRequest(request);
    const stats = {
      users: getOne<{ count: number }>("SELECT COUNT(*) AS count FROM users")?.count || 0,
      tasks:
        getOne<{ count: number }>(`SELECT COUNT(*) AS count FROM rewrite_tasks WHERE ${notExpiredSql()}`)
          ?.count || 0,
      cardsUnused:
        getOne<{ count: number }>("SELECT COUNT(*) AS count FROM redeem_cards WHERE status = 'unused'")
          ?.count || 0,
      cardsRedeemed:
        getOne<{ count: number }>("SELECT COUNT(*) AS count FROM redeem_cards WHERE status = 'redeemed'")
          ?.count || 0,
    };
    const users = getAll(
      `SELECT id, account, role, points, expires_at, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 50`,
    );
    const tasks = getAll(
      `SELECT id, user_id, mode, source_type, input_chars, cost_points, used_free, status, error, created_at
       FROM rewrite_tasks
       WHERE ${notExpiredSql()}
       ORDER BY created_at DESC
       LIMIT 50`,
    );

    return ok({ stats, users, tasks }, request);
  } catch (error) {
    return fail(errorMessage(error), 403, request);
  }
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
