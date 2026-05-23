export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "AIGC文本润色";

export const REWRITE_LIMITS = {
  freeChars: 1000,
  maxChars: 30000,
  segmentChars: 2200,
  timeoutMs: 30000,
};

export const CREDIT_TIERS = [
  { maxChars: 5000, points: 1 },
  { maxChars: 10000, points: 2 },
  { maxChars: 20000, points: 4 },
  { maxChars: 30000, points: 6 },
];

export const PACKAGES = [
  {
    price: "5",
    originalPrice: "7",
    points: 4,
    name: "轻量版",
    badge: "低价体验",
    validityDays: 7,
    quotaText: "约2万字额度",
    note: "适合短论文、开题报告和单篇作业润色",
    payUrl: "https://pay.ldxp.cn/item/xdcd9z",
  },
  {
    price: "9.9",
    originalPrice: "15",
    points: 12,
    name: "论文版",
    badge: "更划算",
    featured: true,
    validityDays: 30,
    quotaText: "约6万字额度",
    note: "适合毕业论文、课程论文和多次修改",
    payUrl: "https://pay.ldxp.cn/item/9hf4qs",
  },
];

export type RewriteMode = "standard" | "plain" | "deep";

export const DEFAULT_REWRITE_MODE: RewriteMode = "plain";

export const REWRITE_MODES: Record<
  RewriteMode,
  { label: string; description: string; instruction: string }
> = {
  standard: {
    label: "轻度润色",
    description: "改动更克制，适合原文已经比较通顺的段落。",
    instruction:
      "采用轻度润色，只做必要的语序调整、同义替换和衔接优化，尽量保留原句结构和原文节奏，不要大幅重写。",
  },
  plain: {
    label: "AIGC 降重润色",
    description: "默认风格，重点弱化机器感，文笔平实普通。",
    instruction:
      "采用默认降 AIGC 润色，重点弱化模板化、精炼化和机器生成感，文风保持平实普通，像普通学生在基础论文规范下写出来的表达。",
  },
  deep: {
    label: "深度改写",
    description: "改动更明显，适合机器感较重或重复表达较多的文本。",
    instruction:
      "采用深度改写，可以更明显地调整句子顺序、主谓宾结构、把字句和被动句，拆分或合并句子，并替换重复表达，但不得改变核心含义、事实和数据。",
  },
};
