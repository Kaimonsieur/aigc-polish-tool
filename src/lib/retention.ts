import { getDb } from "@/lib/db";

export const TASK_RETENTION_HOURS = 24;

export function purgeExpiredRewriteData() {
  const db = getDb();
  const cutoff = `-${TASK_RETENTION_HOURS} hours`;
  const expiredTasks = db
    .prepare("SELECT id FROM rewrite_tasks WHERE created_at < datetime('now', ?)")
    .all(cutoff) as Array<{ id: string }>;

  if (!expiredTasks.length) {
    return 0;
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const task of expiredTasks) {
      db.prepare("DELETE FROM api_logs WHERE task_id = ?").run(task.id);
      db.prepare("DELETE FROM credit_logs WHERE ref_type = 'rewrite_task' AND ref_id = ?").run(task.id);
      db.prepare("DELETE FROM rewrite_tasks WHERE id = ?").run(task.id);
    }
    db.prepare("DELETE FROM documents WHERE created_at < datetime('now', ?)").run(cutoff);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return expiredTasks.length;
}

export function notExpiredSql(alias = "rewrite_tasks") {
  return `${alias}.created_at >= datetime('now', '-${TASK_RETENTION_HOURS} hours')`;
}
