import crypto from "node:crypto";

const PASSWORD_ITERATIONS = 120000;
const KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, KEY_LENGTH, "sha512")
    .toString("hex");

  return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [kind, iterations, salt, hash] = stored.split("$");
  if (kind !== "pbkdf2" || !iterations || !salt || !hash) {
    return false;
  }

  const next = crypto
    .pbkdf2Sync(password, salt, Number(iterations), KEY_LENGTH, "sha512")
    .toString("hex");

  return crypto.timingSafeEqual(Buffer.from(next, "hex"), Buffer.from(hash, "hex"));
}

export function hashCardCode(code: string) {
  const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
  return crypto.createHmac("sha256", secret).update(normalizeCardCode(code)).digest("hex");
}

export function normalizeCardCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function createCardCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const groups = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join(""),
  );

  return `AIGC-${groups.join("-")}`;
}

export function previewCode(code: string) {
  const normalized = normalizeCardCode(code);
  return `${normalized.slice(0, 9)}****${normalized.slice(-4)}`;
}

export function randomId(prefix = "") {
  return `${prefix}${crypto.randomBytes(12).toString("hex")}`;
}
