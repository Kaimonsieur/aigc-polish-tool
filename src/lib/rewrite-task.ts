import { countTextChars } from "@/lib/billing";
import { DEFAULT_REWRITE_MODE, REWRITE_MODES, RewriteMode } from "@/lib/config";
import { getDb, getOne } from "@/lib/db";
import { errorMessage } from "@/lib/http";
import { notExpiredSql } from "@/lib/retention";
import { rewriteText } from "@/lib/rewrite";

export const INLINE_RESULT_CHAR_LIMIT = 900;

export type RewriteTaskStatus = "pending" | "processing" | "success" | "failed";

export type RewriteTaskRow = {
  id: string;
  user_id: number;
  mode: RewriteMode;
  source_type: "text" | "document";
  input_chars: number;
  cost_points: number;
  used_free: number;
  status: RewriteTaskStatus;
  error: string | null;
  input_text?: string;
  output_text: string | null;
  created_at: string;
  finished_at: string | null;
};

export function getRewriteTaskForUser(taskId: string | null, userId: number) {
  if (!taskId) {
    return null;
  }

  return (
    getOne<RewriteTaskRow>(
      `SELECT id, user_id, mode, source_type, input_chars, cost_points, used_free,
              status, error, output_text, created_at, finished_at
       FROM rewrite_tasks
       WHERE id = ? AND user_id = ? AND ${notExpiredSql()}`,
      taskId,
      userId,
    ) || null
  );
}

export function buildRewriteTaskPayload(task: RewriteTaskRow) {
  const output = task.status === "success" ? task.output_text || "" : "";
  const outputChars = output ? countTextChars(output) : 0;
  const inline =
    task.status === "success" &&
    task.source_type === "text" &&
    task.input_chars <= INLINE_RESULT_CHAR_LIMIT &&
    outputChars <= INLINE_RESULT_CHAR_LIMIT;

  return {
    taskId: task.id,
    status: task.status,
    renderMode: inline ? ("inline" as const) : ("backend" as const),
    output: inline ? output : undefined,
    outputPreview: inline ? output : undefined,
    outputTruncated: task.status === "success" && !inline,
    inputChars: task.input_chars,
    outputChars,
    costPoints: task.cost_points,
    usedFree: Boolean(task.used_free),
    error: task.error || undefined,
  };
}

export function startRewriteTask(taskId: string) {
  void processRewriteTask(taskId).catch((error) => {
    console.error("rewrite task worker crashed", taskId, error);
  });
}

async function processRewriteTask(taskId: string) {
  const db = getDb();
  const task = getOne<RewriteTaskRow>(
    `SELECT id, user_id, mode, source_type, input_chars, cost_points, used_free,
            status, error, input_text, output_text, created_at, finished_at
     FROM rewrite_tasks
     WHERE id = ?`,
    taskId,
  );

  if (!task || task.status !== "processing") {
    return;
  }

  const startedAt = Date.now();
  const mode = REWRITE_MODES[task.mode] ? task.mode : DEFAULT_REWRITE_MODE;

  try {
    if (!task.input_text) {
      throw new Error("任务内容不存在，请重新提交");
    }

    const result = await rewriteText(task.input_text, mode);
    const outputChars = countTextChars(result.output);

    db.prepare(
      `UPDATE rewrite_tasks
       SET status = 'success', output_text = ?, finished_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'processing'`,
    ).run(result.output, taskId);

    db.prepare(
      `INSERT INTO api_logs
        (task_id, provider, model, input_chars, output_chars, duration_ms, status)
       VALUES (?, 'grok', ?, ?, ?, ?, 'success')`,
    ).run(taskId, result.model, task.input_chars, outputChars, result.durationMs);
  } catch (error) {
    const message = errorMessage(error);
    db.prepare(
      `UPDATE rewrite_tasks
       SET status = 'failed', error = ?, finished_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'processing'`,
    ).run(message, taskId);

    db.prepare(
      `INSERT INTO api_logs
        (task_id, provider, model, input_chars, duration_ms, status, error)
       VALUES (?, 'grok', ?, ?, ?, 'failed', ?)`,
    ).run(taskId, process.env.GROK_MODEL || "grok-4.20-fast", task.input_chars, Date.now() - startedAt, message);

    refundFailedTask(task);
  }
}

function refundFailedTask(task: RewriteTaskRow) {
  const db = getDb();

  if (task.used_free) {
    const day = new Date().toISOString().slice(0, 10);
    db.prepare(
      `UPDATE free_daily
       SET used_count = max(used_count - 1, 0)
       WHERE user_id = ? AND day = ?`,
    ).run(task.user_id, day);
    return;
  }

  if (task.cost_points <= 0) {
    return;
  }

  const current = getOne<{ points: number }>("SELECT points FROM users WHERE id = ?", task.user_id);
  const nextBalance = (current?.points || 0) + task.cost_points;
  db.prepare("UPDATE users SET points = ? WHERE id = ?").run(nextBalance, task.user_id);
  db.prepare(
    `INSERT INTO credit_logs (user_id, change_points, balance_after, type, ref_type, ref_id, note)
     VALUES (?, ?, ?, 'refund', 'rewrite_task', ?, ?)`,
  ).run(task.user_id, task.cost_points, nextBalance, task.id, "润色失败自动退点");
}
