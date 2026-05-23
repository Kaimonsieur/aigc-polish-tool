import { DEFAULT_REWRITE_MODE, REWRITE_LIMITS, RewriteMode } from "@/lib/config";
import { buildRewriteSystemPrompt } from "@/lib/prompt";
import { splitText } from "@/lib/text";

function systemPrompt(mode: RewriteMode) {
  return buildRewriteSystemPrompt(mode);
}

function cleanSegmentOutput(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\s+|\s+$/g, "")
    .replace(/[ \t]*\n+[ \t]*/g, "");
}

async function callGrok(content: string, mode: RewriteMode) {
  const apiKey = process.env.GROK_API_KEY;
  const apiUrl = process.env.GROK_API_URL || "";
  const model = process.env.GROK_MODEL || "grok-4.20-fast";

  if (!apiUrl || !apiKey) {
    throw new Error("后端未配置 GROK_API_URL 或 GROK_API_KEY，无法调用润色模型");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REWRITE_LIMITS.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt(mode) },
          { role: "user", content },
        ],
        temperature: 0.8,
        stream: false,
      }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body?.error?.message || body?.message || `Grok调用失败：${response.status}`;
      throw new Error(message);
    }

    const text = body?.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string") {
      throw new Error("Grok返回为空");
    }

    return {
      text: text.trim(),
      durationMs: Date.now() - startedAt,
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function rewriteText(input: string, mode: RewriteMode = DEFAULT_REWRITE_MODE) {
  const segments = splitText(input);
  const outputs: string[] = [];
  let durationMs = 0;
  let model = process.env.GROK_MODEL || "grok-4.20-fast";

  for (const segment of segments) {
    const result = await callGrok(segment.text, mode);
    outputs.push(`${segment.separatorBefore}${cleanSegmentOutput(result.text)}`);
    durationMs += result.durationMs;
    model = result.model;
  }

  return {
    output: outputs.join(""),
    segmentCount: segments.length,
    durationMs,
    model,
  };
}
