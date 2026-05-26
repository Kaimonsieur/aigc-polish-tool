import { cookies } from "next/headers";
import { getOne, run } from "@/lib/db";
import { refreshPublicCardQuotaForUser } from "@/lib/public-card";
import { randomId } from "@/lib/security";

export type User = {
  id: number;
  account: string;
  role: "user" | "admin" | "public";
  points: number;
  expires_at: string | null;
  created_at: string;
};

const COOKIE_NAME = "aigc_session";

export async function createSession(userId: number) {
  const sessionId = randomId("sess_");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  run(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    sessionId,
    userId,
    expires.toISOString(),
  );

  (await cookies()).set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  });

  return { sessionId, expiresAt: expires.toISOString() };
}

export async function destroySession() {
  const store = await cookies();
  const sessionId = store.get(COOKIE_NAME)?.value;
  if (sessionId) {
    run("DELETE FROM sessions WHERE id = ?", sessionId);
  }
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const sessionId = (await cookies()).get(COOKIE_NAME)?.value;
  return getUserBySessionId(sessionId);
}

export function getBearerSessionId(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function getUserBySessionId(sessionId: string | null | undefined) {
  if (!sessionId) {
    return null;
  }

  const user = getOne<User>(
    `SELECT users.id, users.account, users.role, users.points, users.expires_at, users.created_at
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > datetime('now')`,
    sessionId,
  );

  if (!user) {
    return null;
  }

  if (user.role !== "admin" && user.role !== "public" && user.expires_at && new Date(user.expires_at).getTime() < Date.now()) {
    run("DELETE FROM sessions WHERE id = ?", sessionId);
    return null;
  }

  return refreshPublicCardQuotaForUser(user);
}

export function getCurrentUserFromRequest(request: Request) {
  return getUserBySessionId(getBearerSessionId(request));
}

export async function requireUserFromRequest(request: Request) {
  const user = getCurrentUserFromRequest(request) || await getCurrentUser();
  if (!user) {
    throw new Error("请先登录");
  }
  return user;
}

export async function requireAdminFromRequest(request: Request) {
  const user = await requireUserFromRequest(request);
  if (user.role !== "admin") {
    throw new Error("需要管理员权限");
  }
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("请先登录");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("需要管理员权限");
  }
  return user;
}
