import { getOne, run } from "@/lib/db";

export function getSetting(key: string, fallback = "") {
  const row = getOne<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  run(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}
