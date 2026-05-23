import { REWRITE_LIMITS } from "@/lib/config";

export type TextSegment = {
  text: string;
  separatorBefore: string;
};

export function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function splitText(text: string, maxChars = REWRITE_LIMITS.segmentChars): TextSegment[] {
  const parts = normalizeText(text).split(/(\n{2,})/);
  const segments: TextSegment[] = [];
  let pendingSeparator = "";

  function pushSegment(segmentText: string, separatorBefore = "") {
    const cleaned = segmentText.trim();
    if (!cleaned) return;
    segments.push({ text: cleaned, separatorBefore });
  }

  for (const part of parts) {
    if (!part) continue;

    if (/^\n{2,}$/.test(part)) {
      pendingSeparator += part;
      continue;
    }

    if (Array.from(part).length <= maxChars) {
      pushSegment(part, pendingSeparator);
      pendingSeparator = "";
      continue;
    }

    const sentences = part.split(/(?<=[。！？；;.!?])/);
    let sentenceChunk = "";
    let chunkSeparator = pendingSeparator;
    for (const sentence of sentences) {
      const maybe = sentenceChunk + sentence;
      if (Array.from(maybe).length > maxChars && sentenceChunk) {
        pushSegment(sentenceChunk, chunkSeparator);
        chunkSeparator = "";
        sentenceChunk = sentence;
      } else {
        sentenceChunk = maybe;
      }
    }
    pushSegment(sentenceChunk, chunkSeparator);
    pendingSeparator = "";
  }

  return segments;
}
