import { withCors, corsOptions } from "@/lib/cors";
import { getResultTask } from "@/lib/result";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlPage(content: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body {
      background: #fbfbfb;
      color: #1a1a1a;
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }
    .wrap {
      min-height: 100%;
      background: #ffffff;
    }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid #eeeeee;
      background: #ffffff;
      padding: 12px 14px;
    }
    .hint {
      color: #777777;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.5;
    }
    button {
      flex: 0 0 auto;
      border: 0;
      border-radius: 999px;
      background: #111111;
      color: #ffffff;
      cursor: pointer;
      font-size: 13px;
      font-weight: 900;
      padding: 9px 16px;
    }
    .result {
      min-height: 420px;
      background: linear-gradient(180deg, #fffdf7 0%, #ffffff 38%);
      color: #1f2933;
      font: 16px/1.9 Arial, "Microsoft YaHei", sans-serif;
      padding: 22px;
      white-space: pre-wrap;
      overflow: auto;
      user-select: text;
    }
    .result::selection {
      background: #dbeafe;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="bar">
      <span class="hint">完整结果已生成，可直接查看或复制全文。</span>
      <button type="button" id="copy">复制全文</button>
    </div>
    <div class="result" id="result">${escapeHtml(content)}</div>
  </div>
  <script>
    const button = document.getElementById("copy");
    const result = document.getElementById("result");
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(result.innerText);
        button.textContent = "已复制";
        setTimeout(() => { button.textContent = "复制全文"; }, 1400);
      } catch {
        const range = document.createRange();
        range.selectNodeContents(result);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("copy");
      }
    });
  </script>
</body>
</html>`;
}

export async function GET(request: Request) {
  const result = await getResultTask(request);
  if ("error" in result) {
    return withCors(new Response(htmlPage(result.error), {
      status: result.status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }), request);
  }

  return withCors(new Response(htmlPage(result.task.output_text), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  }), request);
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
