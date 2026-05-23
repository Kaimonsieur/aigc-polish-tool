import { CREDIT_TIERS, REWRITE_LIMITS } from "@/lib/config";

export function countTextChars(text: string) {
  return Array.from(text.replace(/\s/g, "")).length;
}

export function estimatePoints(chars: number) {
  const tier = CREDIT_TIERS.find((item) => chars <= item.maxChars);
  return tier?.points ?? Number.POSITIVE_INFINITY;
}

export function validateRewriteChars(chars: number) {
  if (chars <= 0) {
    return "请输入需要润色的内容";
  }
  if (chars > REWRITE_LIMITS.maxChars) {
    return "文档内容过长，请精简至3万字以内";
  }
  return null;
}
