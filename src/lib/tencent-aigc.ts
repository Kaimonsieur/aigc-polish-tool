import crypto from "node:crypto";

export type AigcDetectionResult = {
  percent: number;
  label: string;
  suggestion: string;
  detail: string;
  requestId?: string;
};

const ENDPOINT = "https://tms.tencentcloudapi.com";
const HOST = "tms.tencentcloudapi.com";
const SERVICE = "tms";
const ACTION = "TextModeration";
const VERSION = "2020-12-29";
const ALGORITHM = "TC3-HMAC-SHA256";
const DEFAULT_REGION = "ap-guangzhou";
export const AIGC_DETECT_CHAR_LIMIT = 2000;

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function normalizePercent(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  if (number <= 1) {
    return Math.round(number * 100);
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

function labelFromPercent(percent: number) {
  if (percent >= 80) {
    return "高风险";
  }
  if (percent >= 50) {
    return "中风险";
  }
  if (percent >= 20) {
    return "低风险";
  }
  return "较低";
}

function suggestionFromPercent(percent: number) {
  if (percent >= 80) {
    return "建议先进行明显的语序和句式调整，再重新检测。";
  }
  if (percent >= 50) {
    return "建议继续润色重点段落，减少模板化表达。";
  }
  if (percent >= 20) {
    return "整体风险不高，可检查重复句式和过度精炼表达。";
  }
  return "当前片段机器感较低，可继续人工通读确认。";
}

function extractAigcPercent(response: Record<string, unknown>) {
  const candidates = [
    response.AigcScore,
    response.AIGCScore,
    response.Score,
    response.Confidence,
    response.Probability,
    response.AigcProbability,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return normalizePercent(candidate);
    }
  }

  const detail = response.DetailResults;
  if (Array.isArray(detail)) {
    const aigcDetail = detail.find((item) => {
      if (!item || typeof item !== "object") return false;
      const data = item as Record<string, unknown>;
      return String(data.Label || data.Name || data.Type || "").toUpperCase().includes("AIGC");
    }) as Record<string, unknown> | undefined;
    if (aigcDetail) {
      return normalizePercent(aigcDetail.Score ?? aigcDetail.Confidence ?? aigcDetail.Probability);
    }
  }

  return 0;
}

export function validateTencentAigcConfig() {
  const missing = [
    ["TENCENT_SECRET_ID", process.env.TENCENT_SECRET_ID],
    ["TENCENT_SECRET_KEY", process.env.TENCENT_SECRET_KEY],
    ["TENCENT_AIGC_BIZ_TYPE", process.env.TENCENT_AIGC_BIZ_TYPE],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(`腾讯云AIGC检测未配置：${missing.join("、")}`);
  }
}

export async function detectTencentAigc(text: string): Promise<AigcDetectionResult> {
  validateTencentAigcConfig();

  const secretId = process.env.TENCENT_SECRET_ID || "";
  const secretKey = process.env.TENCENT_SECRET_KEY || "";
  const region = process.env.TENCENT_REGION || DEFAULT_REGION;
  const bizType = process.env.TENCENT_AIGC_BIZ_TYPE || "";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify({
    Content: Buffer.from(text).toString("base64"),
    Type: "TEXT_AIGC",
    BizType: bizType,
  });

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${HOST}\nx-tc-action:${ACTION.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join("\n");
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = [ALGORITHM, String(timestamp), credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, SERVICE);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmacHex(secretSigning, stringToSign);
  const authorization = `${ALGORITHM} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: HOST,
      "X-TC-Action": ACTION,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": VERSION,
      "X-TC-Region": region,
    },
    body: payload,
  });
  const body = await response.json();
  const responseBody = body.Response as Record<string, unknown> | undefined;

  if (!response.ok || responseBody?.Error) {
    const error = responseBody?.Error as Record<string, unknown> | undefined;
    throw new Error(String(error?.Message || "腾讯云AIGC检测失败"));
  }

  const percent = extractAigcPercent(responseBody || {});
  return {
    percent,
    label: labelFromPercent(percent),
    suggestion: suggestionFromPercent(percent),
    detail: "检测结果来自腾讯云文本内容安全 AI生成检测，仅代表当前片段的接口返回结果。",
    requestId: typeof responseBody?.RequestId === "string" ? responseBody.RequestId : undefined,
  };
}
