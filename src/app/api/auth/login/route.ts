import { fail } from "@/lib/http";

export async function POST(request: Request) {
  await request.json().catch(() => null);
  return fail("请使用卡密登录", 410);
}
