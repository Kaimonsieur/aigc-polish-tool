import { destroySession } from "@/lib/auth";
import { corsOptions } from "@/lib/cors";
import { ok } from "@/lib/http";

export async function POST(request: Request) {
  await destroySession();
  return ok({ done: true }, request);
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
