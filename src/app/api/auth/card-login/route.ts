import { createSession } from "@/lib/auth";
import { expiresAtFromValidityDays } from "@/lib/cards";
import { corsOptions } from "@/lib/cors";
import { getDb, getOne } from "@/lib/db";
import { fail, ok, errorMessage } from "@/lib/http";
import { tryPublicCardLogin } from "@/lib/public-card";
import { purgeExpiredRewriteData } from "@/lib/retention";
import { hashCardCode, hashPassword, normalizeCardCode } from "@/lib/security";

type CardRow = {
  id: number;
  points: number;
  role: "user" | "admin";
  validity_days: number | null;
  status: string;
  redeemed_by: number | null;
};

type UserRow = {
  id: number;
  account: string;
  role: string;
  points: number;
  expires_at: string | null;
};

export async function POST(request: Request) {
  try {
    purgeExpiredRewriteData();
    const { code } = await request.json();
    const normalized = normalizeCardCode(String(code || ""));
    if (!normalized) {
      return fail("请输入卡密");
    }

    const publicUser = tryPublicCardLogin(normalized);
    if (publicUser) {
      const session = await createSession(publicUser.id);
      return ok(
        { account: publicUser.account, role: publicUser.role, points: publicUser.points, reused: true, publicPool: true, session },
        request,
      );
    }

    const db = getDb();
    const card = getOne<CardRow>(
      "SELECT id, points, role, validity_days, status, redeemed_by FROM redeem_cards WHERE code_hash = ?",
      hashCardCode(normalized),
    );

    if (!card) {
      return fail("卡密不存在");
    }

    if (card.status === "redeemed" && card.redeemed_by) {
      const user = getOne<UserRow>("SELECT id, account, role, points, expires_at FROM users WHERE id = ?", card.redeemed_by);
      if (!user) {
        return fail("卡密账号异常，请联系管理员", 400, request);
      }
      if (user.role !== "admin" && user.expires_at && new Date(user.expires_at).getTime() < Date.now()) {
        return fail("卡密服务期已结束，请重新购买卡密", 400, request);
      }
      const session = await createSession(user.id);
      return ok({ account: user.account, role: user.role, points: user.points, reused: true, session }, request);
    }

    if (card.status !== "unused") {
      return fail("卡密已失效", 400, request);
    }

    const role = card.role === "admin" ? "admin" : "user";
    const accountPrefix = role === "admin" ? "admin_card" : "card";
    const account = `${accountPrefix}_${card.id}_${normalized.slice(-6)}`;
    const userExpiresAt = role === "admin" ? null : expiresAtFromValidityDays(card.validity_days);
    db.exec("BEGIN IMMEDIATE");
    try {
      const created = db
        .prepare("INSERT INTO users (account, password_hash, role, points, expires_at) VALUES (?, ?, ?, ?, ?)")
        .run(account, hashPassword(normalized), role, card.points, userExpiresAt);
      const userId = Number(created.lastInsertRowid);

      db.prepare(
        "UPDATE redeem_cards SET status = 'redeemed', redeemed_by = ?, redeemed_at = CURRENT_TIMESTAMP, expires_at = ? WHERE id = ?",
      ).run(userId, userExpiresAt, card.id);
      db.prepare(
        `INSERT INTO credit_logs (user_id, change_points, balance_after, type, ref_type, ref_id, note)
         VALUES (?, ?, ?, 'redeem', 'card', ?, ?)`,
      ).run(userId, card.points, card.points, String(card.id), "卡密开通");
      db.exec("COMMIT");

      const session = await createSession(userId);
      return ok({ account, role, points: card.points, reused: false, session }, request);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    return fail(errorMessage(error), 400, request);
  }
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
