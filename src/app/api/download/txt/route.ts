import { withCors, corsOptions } from "@/lib/cors";
import { fail } from "@/lib/http";
import { getResultTask } from "@/lib/result";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get("id");
  const result = await getResultTask(request);
  if ("error" in result) {
    return fail(result.error, result.status, request);
  }

  return withCors(new Response(result.task.output_text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="aigc-polish-${id}.txt"`,
    },
  }), request);
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
