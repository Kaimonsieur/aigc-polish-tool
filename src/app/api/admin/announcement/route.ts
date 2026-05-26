import { requireAdminFromRequest } from "@/lib/auth";
import { getAnnouncementConfig, saveAnnouncementConfig } from "@/lib/announcement";
import { corsOptions } from "@/lib/cors";
import { fail, ok, errorMessage } from "@/lib/http";

function isSafeButtonUrl(value: string) {
  if (!value) {
    return true;
  }
  return (value.startsWith("/") && !value.startsWith("//")) || value.startsWith("https://") || value.startsWith("http://");
}

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);
    return ok({ announcement: getAnnouncementConfig() }, request);
  } catch (error) {
    return fail(errorMessage(error), 403, request);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminFromRequest(request);
    const { enabled, title, content, buttonText, buttonUrl } = await request.json();
    const nextTitle = String(title || "").trim();
    const nextContent = String(content || "").trim();
    const nextButtonText = String(buttonText || "").trim();
    const nextButtonUrl = String(buttonUrl || "").trim();

    if (enabled && nextTitle.length < 2) {
      return fail("公告标题太短", 400, request);
    }
    if (enabled && nextContent.length < 2) {
      return fail("公告内容太短", 400, request);
    }
    if (nextTitle.length > 80) {
      return fail("公告标题请控制在80字以内", 400, request);
    }
    if (nextContent.length > 1200) {
      return fail("公告内容请控制在1200字以内", 400, request);
    }
    if (nextButtonText.length > 24) {
      return fail("按钮文案请控制在24字以内", 400, request);
    }
    if (nextButtonUrl.length > 300 || !isSafeButtonUrl(nextButtonUrl)) {
      return fail("按钮链接只支持站内路径或 http/https 地址", 400, request);
    }

    return ok({
      announcement: saveAnnouncementConfig({
        enabled: Boolean(enabled),
        title: nextTitle,
        content: nextContent,
        buttonText: nextButtonText,
        buttonUrl: nextButtonUrl,
      }),
    }, request);
  } catch (error) {
    return fail(errorMessage(error), 403, request);
  }
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
