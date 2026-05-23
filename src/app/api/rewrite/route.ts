import { requireUserFromRequest } from "@/lib/auth";
import { countTextChars, estimatePoints, validateRewriteChars } from "@/lib/billing";
import { corsOptions } from "@/lib/cors";
import { DEFAULT_REWRITE_MODE, REWRITE_LIMITS, RewriteMode, REWRITE_MODES } from "@/lib/config";
import { getDb, getOne } from "@/lib/db";
import { extractDocumentText } from "@/lib/document";
import { fail, ok } from "@/lib/http";
import { purgeExpiredRewriteData } from "@/lib/retention";
import { buildRewriteTaskPayload, getRewriteTaskForUser, startRewriteTask } from "@/lib/rewrite-task";
import { randomId } from "@/lib/security";
import { normalizeText } from "@/lib/text";

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") || DEFAULT_REWRITE_MODE) as RewriteMode;

    if (!(file instanceof File)) {
      throw new Error("请选择要上传的文档");
    }

    return {
      text: await extractDocumentText(file),
      mode,
      sourceType: "document" as const,
      fileName: file.name,
      mimeType: file.type,
    };
  }

  const body = await request.json();
  return {
    text: normalizeText(String(body.text || "")),
    mode: String(body.mode || DEFAULT_REWRITE_MODE) as RewriteMode,
    sourceType: "text" as const,
    fileName: null,
    mimeType: null,
  };
}

export async function POST(request: Request) {
  purgeExpiredRewriteData();
  const taskId = randomId("task_");

  try {
    const user = await requireUserFromRequest(request);
    const payload = await readPayload(request);
    const mode = REWRITE_MODES[payload.mode] ? payload.mode : DEFAULT_REWRITE_MODE;
    const chars = countTextChars(payload.text);
    const validation = validateRewriteChars(chars);

    if (validation) {
      return fail(validation, 400, request);
    }

    const today = new Date().toISOString().slice(0, 10);
    const free = getOne<{ used_count: number }>(
      "SELECT used_count FROM free_daily WHERE user_id = ? AND day = ?",
      user.id,
      today,
    );
    const usedFree =
      payload.sourceType === "text" && chars <= REWRITE_LIMITS.freeChars && (free?.used_count || 0) < 1;
    const costPoints = usedFree ? 0 : estimatePoints(chars);

    if (!Number.isFinite(costPoints)) {
      return fail("文档内容过长，请精简至3万字以内", 400, request);
    }

    if (!usedFree && user.points < costPoints) {
      return fail(`点数不足，本次需要 ${costPoints} 点，当前余额 ${user.points} 点`, 400, request);
    }

    const db = getDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        `INSERT INTO rewrite_tasks
          (id, user_id, mode, source_type, input_chars, cost_points, used_free, status, input_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?)`,
      ).run(taskId, user.id, mode, payload.sourceType, chars, costPoints, usedFree ? 1 : 0, payload.text);

      if (payload.sourceType === "document") {
        db.prepare(
          `INSERT INTO documents (id, user_id, file_name, mime_type, chars, extracted_text)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(randomId("doc_"), user.id, payload.fileName, payload.mimeType, chars, payload.text);
      }

      if (usedFree) {
        db.prepare(
          `INSERT INTO free_daily (user_id, day, used_count)
           VALUES (?, ?, 1)
           ON CONFLICT(user_id, day) DO UPDATE SET used_count = used_count + 1`,
        ).run(user.id, today);
      } else if (costPoints > 0) {
        const nextBalance = user.points - costPoints;
        db.prepare("UPDATE users SET points = ? WHERE id = ?").run(nextBalance, user.id);
        db.prepare(
          `INSERT INTO credit_logs (user_id, change_points, balance_after, type, ref_type, ref_id, note)
           VALUES (?, ?, ?, 'rewrite_cost', 'rewrite_task', ?, ?)`,
        ).run(user.id, -costPoints, nextBalance, taskId, "AIGC润色自动扣点");
      }

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    startRewriteTask(taskId);

    const task = getRewriteTaskForUser(taskId, user.id);
    if (!task) {
      return fail("任务创建失败，请重新提交", 500, request);
    }

    return ok(
      {
        ...buildRewriteTaskPayload(task),
        inputText: payload.sourceType === "document" ? payload.text : undefined,
      },
      request,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求失败，请稍后重试";
    return fail(message, 400, request);
  }
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
