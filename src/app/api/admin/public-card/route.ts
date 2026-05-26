import { requireAdminFromRequest } from "@/lib/auth";
import { corsOptions } from "@/lib/cors";
import { fail, ok, errorMessage } from "@/lib/http";
import {
  getPublicCardAdminState,
  getPublicCardConfig,
  resetPublicCardQuota,
  savePublicCardConfig,
} from "@/lib/public-card";
import { normalizeCardCode } from "@/lib/security";

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);
    return ok(getPublicCardAdminState(), request);
  } catch (error) {
    return fail(errorMessage(error), 403, request);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminFromRequest(request);
    const body = await request.json();
    const current = getPublicCardConfig();
    const code = normalizeCardCode(String(body.code || ""));

    if (body.enabled && !code && !current.codeHash) {
      return fail("开启公益卡密前请先设置卡密", 400, request);
    }

    return ok(savePublicCardConfig(body), request);
  } catch (error) {
    return fail(errorMessage(error), 403, request);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminFromRequest(request);
    const { action } = await request.json();
    if (action !== "reset") {
      return fail("不支持的操作", 400, request);
    }
    resetPublicCardQuota(true);
    return ok(getPublicCardAdminState(), request);
  } catch (error) {
    return fail(errorMessage(error), 403, request);
  }
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
