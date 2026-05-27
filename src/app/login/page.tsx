"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Check, KeyRound, Loader2, X } from "lucide-react";
import { PACKAGES } from "@/lib/config";
import { apiFetch, setSessionToken } from "@/lib/client-api";

type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

type LoginData = {
  account: string;
  role: "user" | "admin" | "public";
  points: number;
  reused: boolean;
  session?: {
    sessionId: string;
    expiresAt: string;
  };
};

async function post<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  const response = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

export default function LoginPage() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function cardLogin() {
    setLoading(true);
    setMessage("");
    const result = await post<LoginData>("/api/auth/card-login", { code });
    setLoading(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setSessionToken(result.data.session?.sessionId);
    window.location.assign(result.data.role === "admin" ? "/admin" : "/");
  }

  return (
    <main className="login-shell flex min-h-screen items-center justify-center px-4 py-10">
      <div className="login-card animate-pop-in">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="text-sm font-bold text-[#777] transition hover:text-[#111]">
            返回首页
          </Link>
          <Link href="/" className="interactive-icon">
            <X size={20} />
          </Link>
        </div>

        <div className="text-center">
          <Image className="brand-logo mx-auto mb-4" src="/brand-logo.png" alt="论文降AIGC" width={196} height={67} priority />
          <h1 className="text-3xl font-black">开通服务</h1>
          <p className="mt-2 text-[#777]">购买后获得卡密，付费记录24小时内可查询和下载</p>
        </div>

        <div className="plan-grid mt-8">
          {PACKAGES.map((item) => (
            <div key={item.name} className={item.featured ? "plan-card plan-card-featured" : "plan-card"}>
              <span className="plan-badge">{item.badge}</span>
              <p className="font-black">{item.name}</p>
              <p className="mt-4 text-4xl font-black">
                <span className="mr-1 text-lg">¥</span>
                {item.price}
                <span className="ml-2 text-base font-normal text-[#bbb] line-through">¥{item.originalPrice}</span>
              </p>
              <div className="mt-5 space-y-3 text-sm text-[#555]">
                <p className="flex items-center gap-2">
                  <Check size={16} className="text-emerald-500" />
                  {item.validityDays}天有效期
                </p>
                <p className="flex items-center gap-2">
                  <Check size={16} className="text-emerald-500" />
                  {item.quotaText}
                </p>
                <p className="border-t border-dashed border-[#eee] pt-4 leading-6 text-[#666]">{item.note}</p>
              </div>
              <a className="button-primary mt-5 flex w-full items-center justify-center px-4 py-3 text-sm" href={item.payUrl} target="_blank" rel="noreferrer">
                购买卡密
              </a>
            </div>
          ))}
        </div>

        <div className="my-7 flex items-center gap-4 text-sm text-[#aaa]">
          <span className="h-px flex-1 bg-[#eee]" />
          使用已有卡密登录
          <span className="h-px flex-1 bg-[#eee]" />
        </div>

        <div className="redeem-row">
          <div className="relative">
            <KeyRound className="absolute left-5 top-1/2 -translate-y-1/2 text-[#aaa]" size={18} />
            <input
              className="field w-full px-12 py-4"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  cardLogin();
                }
              }}
              placeholder="在此输入您的卡密"
            />
          </div>
          <button className="button-primary flex items-center justify-center gap-2 px-9 py-4" onClick={cardLogin} disabled={loading} type="button">
            {loading && <Loader2 className="animate-spin" size={16} />}
            {loading ? "登录中" : "登录"}
          </button>
        </div>

        {message && <p className="mt-4 animate-fade-in rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>}
      </div>
    </main>
  );
}
