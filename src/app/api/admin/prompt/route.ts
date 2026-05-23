import { requireAdminFromRequest } from "@/lib/auth";
import { corsOptions } from "@/lib/cors";
import { fail, ok, errorMessage } from "@/lib/http";
import { DEFAULT_REWRITE_RULES, getRewriteRules, PROMPT_RULES_KEY } from "@/lib/prompt";
import { setSetting } from "@/lib/settings";

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);
    return ok({ rules: getRewriteRules(), defaultRules: DEFAULT_REWRITE_RULES }, request);
  } catch (error) {
    return fail(errorMessage(error), 403, request);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminFromRequest(request);
    const { rules } = await request.json();
    const nextRules = String(rules || "").trim();
    if (nextRules.length < 20) {
      return fail("规则内容太短，请填写完整规则", 400, request);
    }
    if (nextRules.length > 8000) {
      return fail("规则内容过长，请控制在8000字以内", 400, request);
    }
    setSetting(PROMPT_RULES_KEY, nextRules);
    return ok({ rules: nextRules }, request);
  } catch (error) {
    return fail(errorMessage(error), 403, request);
  }
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
