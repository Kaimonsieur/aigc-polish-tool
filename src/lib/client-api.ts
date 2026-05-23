"use client";

const TOKEN_KEY = "aigc_session_token";
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");

function apiUrl(path: string) {
  if (!API_BASE || path.startsWith("http")) {
    return path;
  }
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getSessionToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setSessionToken(token: string | null | undefined) {
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export function buildDownloadUrl(path: string) {
  const token = getSessionToken();
  const separator = path.includes("?") ? "&" : "?";
  const withToken = token ? `${path}${separator}token=${encodeURIComponent(token)}` : path;
  return apiUrl(withToken);
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getSessionToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: API_BASE ? "omit" : "same-origin",
  });
}
