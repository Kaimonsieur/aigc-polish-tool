import { requireUser } from "@/lib/auth";
import { getDb, getOne } from "@/lib/db";
import { fail, ok, errorMessage } from "@/lib/http";
import { hashCardCode } from "@/lib/security";

type CardRow = {
  id: number;
  points: number;
  validity_days: number | null;
  status: string;
};

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { code } = await request.json();
    const codeHash = hashCardCode(String(code || ""));
    const db = getDb();
    const card = getOne<CardRow>(
      "SELECT id, points, validity_days, status FROM redeem_cards WHERE code_hash = ?",
      codeHash,
    );

    if (!card) {
      return fail("卡密不存在");
    }
    if (card.status !== "unused") {
      return fail("卡密已使用或已失效");
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      const current = getOne<{ points: number; expires_at: string | null; role: string }>(
        "SELECT points, expires_at, role FROM users WHERE id = ?",
        user.id,
      );
      const nextBalance = (current?.points || 0) + card.points;
      let nextUserExpiresAt = current?.expires_at || null;
      if (current?.role !== "admin" && card.validity_days) {
        const baseTime = nextUserExpiresAt && new Date(nextUserExpiresAt).getTime() > Date.now()
          ? new Date(nextUserExpiresAt).getTime()
          : Date.now();
        nextUserExpiresAt = new Date(baseTime + card.validity_days * 24 * 60 * 60 * 1000).toISOString();
      }

      db.prepare(
        "UPDATE redeem_cards SET status = 'redeemed', redeemed_by = ?, redeemed_at = CURRENT_TIMESTAMP, expires_at = ? WHERE id = ?",
      ).run(user.id, nextUserExpiresAt, card.id);
      db.prepare("UPDATE users SET points = ?, expires_at = ? WHERE id = ?").run(nextBalance, nextUserExpiresAt, user.id);
      db.prepare(
        `INSERT INTO credit_logs (user_id, change_points, balance_after, type, ref_type, ref_id, note)
         VALUES (?, ?, ?, 'redeem', 'card', ?, ?)`,
      ).run(user.id, card.points, nextBalance, String(card.id), "卡密兑换");
      db.exec("COMMIT");

      return ok({ points: card.points, balance: nextBalance });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    return fail(errorMessage(error));
  }
}
