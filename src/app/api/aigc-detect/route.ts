import { requireUserFromRequest } from "@/lib/auth";
import { countTextChars } from "@/lib/billing";
import { corsOptions } from "@/lib/cors";
import { AIGC_DETECT_CHAR_LIMIT, detectTencentAigc } from "@/lib/tencent-aigc";
import { fail, ok, errorMessage } from "@/lib/http";
import { normalizeText } from "@/lib/text";

export async function POST(request: Request) {
  try {
    await requireUserFromRequest(request);
    const body = await request.json();
    const text = normalizeText(String(body.text || ""));
    const chars = countTextChars(text);

    if (!chars) {
      return fail("请输入需要检测的文本", 400, request);
    }
    if (chars > AIGC_DETECT_CHAR_LIMIT) {
      return fail(`单次检测建议控制在${AIGC_DETECT_CHAR_LIMIT}字以内，请截取重点段落检测`, 400, request);
    }

    const result = await detectTencentAigc(text);
    return ok({ ...result, chars, provider: "TencentCloud" }, request);
  } catch (error) {
    return fail(errorMessage(error), 400, request);
  }
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
