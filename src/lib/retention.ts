import { getDb } from "@/lib/db";

export const TASK_RETENTION_HOURS = 24;
export const PUBLIC_TASK_RETENTION_MINUTES = 10;

const NORMAL_CUTOFF = `-${TASK_RETENTION_HOURS} hours`;
const PUBLIC_CUTOFF = `-${PUBLIC_TASK_RETENTION_MINUTES} minutes`;

export function retentionMinutesForRole(role: string) {
  return role === "public" ? PUBLIC_TASK_RETENTION_MINUTES : TASK_RETENTION_HOURS * 60;
}

export function retentionLabelForRole(role: string) {
  return role === "public" ? `${PUBLIC_TASK_RETENTION_MINUTES}分钟` : `${TASK_RETENTION_HOURS}小时`;
}

export function purgeExpiredRewriteData() {
  const db = getDb();
  const expiredTasks = db
    .prepare(
      `SELECT t.id
       FROM rewrite_tasks AS t
       LEFT JOIN users AS u ON u.id = t.user_id
       WHERE (u.role = 'public' AND coalesce(t.finished_at, t.created_at) < datetime('now', ?))
          OR (coalesce(u.role, 'user') <> 'public' AND coalesce(t.finished_at, t.created_at) < datetime('now', ?))`,
    )
    .all(PUBLIC_CUTOFF, NORMAL_CUTOFF) as Array<{ id: string }>;

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const task of expiredTasks) {
      db.prepare("DELETE FROM api_logs WHERE task_id = ?").run(task.id);
      db.prepare("DELETE FROM aigc_detection_reports WHERE task_id = ?").run(task.id);
      db.prepare("DELETE FROM credit_logs WHERE ref_type = 'rewrite_task' AND ref_id = ?").run(task.id);
      db.prepare("DELETE FROM rewrite_tasks WHERE id = ?").run(task.id);
    }
    db.prepare(
      `DELETE FROM documents
       WHERE id IN (
         SELECT d.id
         FROM documents AS d
         LEFT JOIN users AS u ON u.id = d.user_id
         WHERE (u.role = 'public' AND d.created_at < datetime('now', ?))
            OR (coalesce(u.role, 'user') <> 'public' AND d.created_at < datetime('now', ?))
       )`,
    ).run(PUBLIC_CUTOFF, NORMAL_CUTOFF);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return expiredTasks.length;
}

export function notExpiredSql(alias = "rewrite_tasks") {
  return `(coalesce(${alias}.finished_at, ${alias}.created_at) >= CASE
    WHEN EXISTS (
      SELECT 1 FROM users AS retention_users
      WHERE retention_users.id = ${alias}.user_id AND retention_users.role = 'public'
    )
    THEN datetime('now', '-${PUBLIC_TASK_RETENTION_MINUTES} minutes')
    ELSE datetime('now', '-${TASK_RETENTION_HOURS} hours')
  END)`;
}
