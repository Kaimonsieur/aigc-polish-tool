import { corsOptions } from "@/lib/cors";
import { ok } from "@/lib/http";
import { getPublicAnnouncement } from "@/lib/announcement";

export async function GET(request: Request) {
  return ok({ announcement: getPublicAnnouncement() }, request);
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
