import { requireUserFromRequest } from "@/lib/auth";
import { countTextChars } from "@/lib/billing";
import { corsOptions } from "@/lib/cors";
import { getDb, getOne } from "@/lib/db";
import { fail, ok, errorMessage } from "@/lib/http";
import { notExpiredSql } from "@/lib/retention";
import { AIGC_DETECT_CHAR_LIMIT, detectTencentAigc } from "@/lib/tencent-aigc";

type TaskRow = {
  id: string;
  user_id: number;
  status: string;
  output_text: string | null;
};

type CachedReport = {
  provider: string;
  chars: number;
  percent: number;
  label: string;
  suggestion: string;
  detail: string;
  request_id: string | null;
};

function reportPayload(report: CachedReport, cached: boolean) {
  return {
    provider: report.provider,
    chars: report.chars,
    percent: report.percent,
    label: report.label,
    suggestion: report.suggestion,
    detail: report.detail,
    requestId: report.request_id || undefined,
    cached,
  };
}

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    if (user.role === "public") {
      return fail("公益卡密不支持 AIGC 检测，请使用付费卡密后再开启检测。", 403, request);
    }

    const body = await request.json();
    const taskId = String(body.taskId || "");
    if (!taskId) {
      return fail("缺少润色任务ID", 400, request);
    }

    const db = getDb();
    const task = getOne<TaskRow>(
      `SELECT id, user_id, status, output_text
       FROM rewrite_tasks
       WHERE id = ? AND user_id = ? AND ${notExpiredSql()}`,
      taskId,
      user.id,
    );

    if (!task) {
      return fail("润色任务不存在或已过期", 404, request);
    }
    if (task.status !== "success" || !task.output_text) {
      return fail("润色完成后才能检测", 400, request);
    }

    const cached = getOne<CachedReport>(
      `SELECT provider, chars, percent, label, suggestion, detail, request_id
       FROM aigc_detection_reports
       WHERE task_id = ? AND user_id = ?`,
      task.id,
      user.id,
    );
    if (cached) {
      return ok(reportPayload(cached, true), request);
    }

    const chars = countTextChars(task.output_text);
    if (chars > AIGC_DETECT_CHAR_LIMIT) {
      return fail(`单次检测建议控制在${AIGC_DETECT_CHAR_LIMIT}字以内，请拆分重点段落检测`, 400, request);
    }

    const result = await detectTencentAigc(task.output_text);
    db.prepare(
      `INSERT INTO aigc_detection_reports
        (task_id, user_id, provider, chars, percent, label, suggestion, detail, request_id)
       VALUES (?, ?, 'TencentCloud', ?, ?, ?, ?, ?, ?)`,
    ).run(task.id, user.id, chars, result.percent, result.label, result.suggestion, result.detail, result.requestId || null);

    const saved = getOne<CachedReport>(
      `SELECT provider, chars, percent, label, suggestion, detail, request_id
       FROM aigc_detection_reports
       WHERE task_id = ? AND user_id = ?`,
      task.id,
      user.id,
    );

    const fallbackReport: CachedReport = {
      provider: "TencentCloud",
      chars,
      percent: result.percent,
      label: result.label,
      suggestion: result.suggestion,
      detail: result.detail,
      request_id: result.requestId || null,
    };

    return ok(reportPayload(saved || fallbackReport, false), request);
  } catch (error) {
    return fail(errorMessage(error), 400, request);
  }
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
