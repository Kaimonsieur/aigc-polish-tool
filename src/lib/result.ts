import { getCurrentUser, getCurrentUserFromRequest, getUserBySessionId } from "@/lib/auth";
import { getOne } from "@/lib/db";
import { notExpiredSql, purgeExpiredRewriteData } from "@/lib/retention";

export type ResultTaskRow = {
  output_text: string;
};

type ResultTaskSuccess = {
  task: ResultTaskRow;
};

type ResultTaskFailure = {
  error: string;
  status: 401 | 404;
};

export async function getResultTask(request: Request): Promise<ResultTaskSuccess | ResultTaskFailure> {
  purgeExpiredRewriteData();
  const searchParams = new URL(request.url).searchParams;
  const user = getCurrentUserFromRequest(request) || getUserBySessionId(searchParams.get("token")) || await getCurrentUser();
  if (!user) {
    return { error: "请先登录", status: 401 as const };
  }

  const id = searchParams.get("id");
  const task = getOne<ResultTaskRow>(
    `SELECT output_text FROM rewrite_tasks
     WHERE id = ? AND user_id = ? AND status = 'success' AND ${notExpiredSql()}`,
    id,
    user.id,
  );

  if (!task?.output_text) {
    return { error: user.role === "public" ? "没有可查看的润色结果，公益记录可能已超过10分钟" : "没有可查看的润色结果，记录可能已超过24小时", status: 404 as const };
  }

  return { task };
}
