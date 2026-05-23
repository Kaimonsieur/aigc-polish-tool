import { NextResponse } from "next/server";

const DEFAULT_METHODS = "GET,POST,PATCH,OPTIONS";
const DEFAULT_HEADERS = "Content-Type,Authorization";

function allowedOrigins() {
  return (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function corsOrigin(request: Request) {
  const origin = request.headers.get("origin") || "";
  const origins = allowedOrigins();
  if (!origin || origins.length === 0) {
    return null;
  }
  if (origins.includes("*") || origins.includes(origin)) {
    return origin;
  }
  return null;
}

export function withCors(response: Response, request: Request) {
  const origin = corsOrigin(request);
  if (!origin) {
    return response;
  }
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", DEFAULT_METHODS);
  response.headers.set("Access-Control-Allow-Headers", DEFAULT_HEADERS);
  response.headers.set("Vary", "Origin");
  return response;
}

export function corsOptions(request: Request) {
  const response = new NextResponse(null, { status: 204 });
  return withCors(response, request);
}
