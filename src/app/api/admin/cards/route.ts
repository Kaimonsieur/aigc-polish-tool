import { requireAdminFromRequest } from "@/lib/auth";
import { defaultCardPointsForRole, validityDaysForCard } from "@/lib/cards";
import { corsOptions } from "@/lib/cors";
import { getAll, getDb, getOne } from "@/lib/db";
import { fail, ok, errorMessage } from "@/lib/http";
import { createCardCode, hashCardCode, previewCode } from "@/lib/security";

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);
    const batches = getAll(
      `SELECT b.*,
        SUM(CASE WHEN c.status = 'unused' THEN 1 ELSE 0 END) AS unused_count,
        SUM(CASE WHEN c.status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed_count
       FROM card_batches b
       LEFT JOIN redeem_cards c ON c.batch_id = b.id
       GROUP BY b.id
       ORDER BY b.created_at DESC
       LIMIT 20`,
    );
    const recentCards = getAll(
      `SELECT c.id, c.batch_id, c.code_preview, c.points, c.role, c.validity_days, c.status, c.redeemed_by, c.redeemed_at, c.expires_at, c.created_at,
        b.name AS batch_name,
        u.account AS redeemed_account
       FROM redeem_cards c
       LEFT JOIN card_batches b ON b.id = c.batch_id
       LEFT JOIN users u ON u.id = c.redeemed_by
       ORDER BY c.created_at DESC
       LIMIT 100`,
    );

    return ok({ batches, recentCards }, request);
  } catch (error) {
    return fail(errorMessage(error), 403, request);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminFromRequest(request);
    const { id, action } = await request.json();
    const cardId = Number(id);
    if (!Number.isInteger(cardId) || cardId <= 0) {
      return fail("卡密ID不正确", 400, request);
    }

    const card = getOne<{ id: number; status: string; redeemed_by: number | null }>(
      "SELECT id, status, redeemed_by FROM redeem_cards WHERE id = ?",
      cardId,
    );
    if (!card) {
      return fail("卡密不存在", 404, request);
    }
    if (card.status === "redeemed" || card.redeemed_by) {
      return fail("已兑换卡密不能作废或恢复", 400, request);
    }

    const db = getDb();
    if (action === "void") {
      db.prepare("UPDATE redeem_cards SET status = 'void' WHERE id = ? AND status = 'unused'").run(cardId);
      return ok({ id: cardId, status: "void" }, request);
    }
    if (action === "restore") {
      db.prepare("UPDATE redeem_cards SET status = 'unused' WHERE id = ? AND status IN ('void', 'expired')").run(cardId);
      return ok({ id: cardId, status: "unused" }, request);
    }

    return fail("不支持的操作", 400, request);
  } catch (error) {
    return fail(errorMessage(error), 403, request);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const { name, points, quantity, role } = await request.json();
    const cardQuantity = Number(quantity);
    const cardRole = role === "admin" ? "admin" : "user";
    const cardPoints = defaultCardPointsForRole(cardRole, Number(points));
    const validityDays = validityDaysForCard(cardPoints, cardRole);

    if (!Number.isInteger(cardPoints) || cardPoints <= 0 || cardPoints > 999) {
      return fail("点数必须是1-999之间的整数", 400, request);
    }
    if (cardRole !== "admin" && !validityDays) {
      return fail("请选择有效套餐生成用户卡密", 400, request);
    }
    if (!Number.isInteger(cardQuantity) || cardQuantity <= 0 || cardQuantity > 500) {
      return fail("单次最多生成500张卡密", 400, request);
    }

    const db = getDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      const batch = db
        .prepare(
          `INSERT INTO card_batches (name, points, quantity, role, validity_days, expires_at, created_by)
           VALUES (?, ?, ?, ?, ?, NULL, ?)`,
        )
        .run(String(name || `${cardPoints}点卡密`), cardPoints, cardQuantity, cardRole, validityDays, admin.id);
      const batchId = Number(batch.lastInsertRowid);
      const codes: string[] = [];

      for (let index = 0; index < cardQuantity; index += 1) {
        let code = createCardCode();
        let attempts = 0;
        while (attempts < 5) {
          try {
            db.prepare(
              `INSERT INTO redeem_cards (batch_id, code_hash, code_preview, points, role, validity_days, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, NULL)`,
            ).run(batchId, hashCardCode(code), previewCode(code), cardPoints, cardRole, validityDays);
            codes.push(code);
            break;
          } catch {
            code = createCardCode();
            attempts += 1;
          }
        }
      }

      db.exec("COMMIT");
      return ok({ batchId, codes }, request);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    return fail(errorMessage(error), 403, request);
  }
}

export function OPTIONS(request: Request) {
  return corsOptions(request);
}
