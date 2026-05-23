import { withCors, corsOptions } from "@/lib/cors";
import { createDocxBuffer } from "@/lib/document";
import { fail } from "@/lib/http";
import { getResultTask } from "@/lib/result";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get("id");
  const result = await getResultTask(request);
  if ("error" in result) {
    return fail(result.error, result.status, request);
  }

  const buffer = await createDocxBuffer(result.task.output_text);
  return withCors(new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="aigc-polish-${id}.docx"`,
    },
  }), request);
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
