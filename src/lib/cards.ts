import { PACKAGES } from "@/lib/config";

const ADMIN_POINTS = 999;

export function validityDaysForCard(points: number, role: string) {
  if (role === "admin") {
    return null;
  }

  const matchedPackage = PACKAGES.find((item) => item.points === points);
  return matchedPackage?.validityDays || null;
}

export function expiresAtFromValidityDays(validityDays: number | null | undefined) {
  if (!validityDays) {
    return null;
  }

  return new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();
}

export function defaultCardPointsForRole(role: string, points: number) {
  return role === "admin" ? ADMIN_POINTS : points;
}
