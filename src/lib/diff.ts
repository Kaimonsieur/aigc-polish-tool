export type DiffPart = {
  text: string;
  type?: "add" | "remove";
};

export type DiffResult = {
  removed: DiffPart[];
  added: DiffPart[];
  skipped?: boolean;
};

const MAX_DIFF_TOKENS = 900;
const MAX_DIFF_CELLS = 320_000;

function tokenize(text: string) {
  return Array.from(text.matchAll(/[\u4e00-\u9fa5]{1,4}|[A-Za-z0-9]+|\s+|[^\s]/g)).map((match) => match[0]);
}

export function buildDiffParts(source: string, target: string): DiffResult {
  const a = tokenize(source);
  const b = tokenize(target);
  const cellCount = (a.length + 1) * (b.length + 1);

  if (a.length + b.length > MAX_DIFF_TOKENS || cellCount > MAX_DIFF_CELLS) {
    return {
      removed: [{ text: source }],
      added: [{ text: target }],
      skipped: true,
    };
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const removed: DiffPart[] = [];
  const added: DiffPart[] = [];
  let i = 0;
  let j = 0;

  function push(parts: DiffPart[], text: string, type?: "add" | "remove") {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last && last.type === type) {
      last.text += text;
    } else {
      parts.push({ text, type });
    }
  }

  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push(removed, a[i]);
      push(added, b[j]);
      i += 1;
      j += 1;
    } else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j])) {
      push(added, b[j], b[j].trim() ? "add" : undefined);
      j += 1;
    } else if (i < a.length) {
      push(removed, a[i], a[i].trim() ? "remove" : undefined);
      i += 1;
    }
  }

  return { removed, added };
}
