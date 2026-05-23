import { getCurrentUser, getCurrentUserFromRequest } from "@/lib/auth";
import { corsOptions } from "@/lib/cors";
import { fail, ok } from "@/lib/http";
import { purgeExpiredRewriteData } from "@/lib/retention";
import { buildRewriteTaskPayload, getRewriteTaskForUser } from "@/lib/rewrite-task";

export async function GET(request: Request) {
  purgeExpiredRewriteData();

  const user = getCurrentUserFromRequest(request) || await getCurrentUser();
  if (!user) {
    return fail("请先登录", 401, request);
  }

  const id = new URL(request.url).searchParams.get("id");
  const task = getRewriteTaskForUser(id, user.id);
  if (!task) {
    return fail("任务不存在或已超过24小时", 404, request);
  }

  return ok(buildRewriteTaskPayload(task), request);
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
