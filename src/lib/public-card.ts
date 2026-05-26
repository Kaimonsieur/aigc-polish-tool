import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { hashCardCode, hashPassword, normalizeCardCode, previewCode, randomId } from "@/lib/security";

export const PUBLIC_CARD_KEY = "public_benefit_card";
const PUBLIC_ACCOUNT = "public_benefit_pool";
const DEFAULT_DAILY_POINTS = 20;

export type PublicCardConfig = {
  enabled: boolean;
  codeHash: string;
  codePreview: string;
  dailyPoints: number;
  note: string;
  accountId: number | null;
  lastResetDay: string;
  lastResetAt: string;
  updatedAt: string;
};

export type PublicCardUser = {
  id: number;
  account: string;
  role: "public";
  points: number;
  expires_at: string | null;
  created_at: string;
};

export const DEFAULT_PUBLIC_CARD: PublicCardConfig = {
  enabled: false,
  codeHash: "",
  codePreview: "",
  dailyPoints: DEFAULT_DAILY_POINTS,
  note: "公益卡密共用一个额度池，每天按北京时间自动重置。",
  accountId: null,
  lastResetDay: "",
  lastResetAt: "",
  updatedAt: "",
};

export function beijingDay(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function clampDailyPoints(value: unknown) {
  const points = Math.floor(Number(value));
  if (!Number.isFinite(points) || points <= 0) {
    return DEFAULT_DAILY_POINTS;
  }
  return Math.min(points, 999);
}

function persistPublicCardConfig(config: PublicCardConfig) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(PUBLIC_CARD_KEY, JSON.stringify(config));
}

export function getPublicCardConfig(): PublicCardConfig {
  const raw = getSetting(PUBLIC_CARD_KEY, "");
  if (!raw) {
    return DEFAULT_PUBLIC_CARD;
  }

  try {
    const stored = JSON.parse(raw) as Partial<PublicCardConfig>;
    return {
      ...DEFAULT_PUBLIC_CARD,
      ...stored,
      enabled: Boolean(stored.enabled),
      codeHash: String(stored.codeHash || ""),
      codePreview: String(stored.codePreview || ""),
      dailyPoints: clampDailyPoints(stored.dailyPoints),
      note: String(stored.note || DEFAULT_PUBLIC_CARD.note),
      accountId: stored.accountId ? Number(stored.accountId) : null,
      lastResetDay: String(stored.lastResetDay || ""),
      lastResetAt: String(stored.lastResetAt || ""),
      updatedAt: String(stored.updatedAt || ""),
    };
  } catch {
    return DEFAULT_PUBLIC_CARD;
  }
}

function findPublicUser(config: PublicCardConfig) {
  if (config.accountId) {
    const byId = getDb()
      .prepare("SELECT id, account, role, points, expires_at, created_at FROM users WHERE id = ?")
      .get(config.accountId) as PublicCardUser | undefined;
    if (byId) {
      return byId;
    }
  }

  return getDb()
    .prepare("SELECT id, account, role, points, expires_at, created_at FROM users WHERE account = ?")
    .get(PUBLIC_ACCOUNT) as PublicCardUser | undefined;
}

export function ensurePublicCardUser(config = getPublicCardConfig()) {
  const db = getDb();
  let user = findPublicUser(config);

  if (!user) {
    const created = db
      .prepare("INSERT INTO users (account, password_hash, role, points, expires_at) VALUES (?, ?, 'public', ?, NULL)")
      .run(PUBLIC_ACCOUNT, hashPassword(randomId("public_")), config.dailyPoints);
    const userId = Number(created.lastInsertRowid);
    user = db
      .prepare("SELECT id, account, role, points, expires_at, created_at FROM users WHERE id = ?")
      .get(userId) as PublicCardUser;
    config = { ...config, accountId: userId };
    persistPublicCardConfig(config);
  } else if (user.role !== "public") {
    db.prepare("UPDATE users SET role = 'public', expires_at = NULL WHERE id = ?").run(user.id);
    user = { ...user, role: "public", expires_at: null };
  }

  if (config.accountId !== user.id) {
    persistPublicCardConfig({ ...config, accountId: user.id });
  }

  return user;
}

export function resetPublicCardQuota(force = false) {
  const config = getPublicCardConfig();
  const user = ensurePublicCardUser(config);
  const today = beijingDay();

  if (!config.enabled && !force) {
    return { config, user, today, reset: false };
  }

  if (!force && config.lastResetDay === today) {
    return { config, user, today, reset: false };
  }

  const db = getDb();
  const current = db.prepare("SELECT points FROM users WHERE id = ?").get(user.id) as { points: number } | undefined;
  const currentPoints = current?.points || 0;
  const nextPoints = config.dailyPoints;
  const nextConfig = {
    ...config,
    accountId: user.id,
    lastResetDay: today,
    lastResetAt: new Date().toISOString(),
  };

  db.prepare("UPDATE users SET points = ?, expires_at = NULL WHERE id = ?").run(nextPoints, user.id);
  db.prepare(
    `INSERT INTO credit_logs (user_id, change_points, balance_after, type, ref_type, ref_id, note)
     VALUES (?, ?, ?, 'public_reset', 'public_card', ?, ?)`,
  ).run(user.id, nextPoints - currentPoints, nextPoints, today, force ? "公益额度手动重置" : "公益额度每日重置");
  persistPublicCardConfig(nextConfig);

  return {
    config: nextConfig,
    user: { ...user, points: nextPoints },
    today,
    reset: true,
  };
}

export function refreshPublicCardQuotaForUser<T extends { id: number; role: string; points: number }>(user: T): T {
  if (user.role !== "public") {
    return user;
  }
  const state = resetPublicCardQuota(false);
  return { ...user, points: state.user.points };
}

export function savePublicCardConfig(input: {
  enabled?: unknown;
  code?: unknown;
  dailyPoints?: unknown;
  note?: unknown;
}) {
  const current = getPublicCardConfig();
  const normalizedCode = normalizeCardCode(String(input.code || ""));
  const next: PublicCardConfig = {
    ...current,
    enabled: Boolean(input.enabled),
    dailyPoints: clampDailyPoints(input.dailyPoints),
    note: String(input.note || DEFAULT_PUBLIC_CARD.note).trim() || DEFAULT_PUBLIC_CARD.note,
    updatedAt: new Date().toISOString(),
  };

  if (normalizedCode) {
    next.codeHash = hashCardCode(normalizedCode);
    next.codePreview = previewCode(normalizedCode);
  }

  const user = ensurePublicCardUser(next);
  persistPublicCardConfig({ ...next, accountId: user.id });
  return getPublicCardAdminState();
}

export function tryPublicCardLogin(code: string) {
  const config = getPublicCardConfig();
  if (!config.enabled || !config.codeHash) {
    return null;
  }
  if (hashCardCode(code) !== config.codeHash) {
    return null;
  }
  const state = resetPublicCardQuota(false);
  return state.user;
}

export function getPublicCardAdminState() {
  const config = getPublicCardConfig();
  const state = config.accountId || config.enabled ? resetPublicCardQuota(false) : null;
  const user = state?.user || findPublicUser(config) || null;
  const today = beijingDay();

  return {
    config: {
      enabled: config.enabled,
      codePreview: config.codePreview,
      dailyPoints: config.dailyPoints,
      note: config.note,
      accountId: user?.id || config.accountId,
      lastResetDay: config.lastResetDay,
      lastResetAt: config.lastResetAt,
      updatedAt: config.updatedAt,
    },
    account: user
      ? {
          id: user.id,
          account: user.account,
          points: user.points,
          created_at: user.created_at,
        }
      : null,
    today,
    remainingPoints: user?.points || 0,
    configured: Boolean(config.codeHash),
  };
}
