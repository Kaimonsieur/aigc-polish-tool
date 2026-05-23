import { NextResponse } from "next/server";
import { withCors } from "@/lib/cors";

export function ok<T>(data: T, request?: Request) {
  const response = NextResponse.json({ ok: true, data });
  return request ? withCors(response, request) : response;
}

export function fail(message: string, status = 400, request?: Request) {
  const response = NextResponse.json({ ok: false, message }, { status });
  return request ? withCors(response, request) : response;
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试";
}
