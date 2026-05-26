"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeCheck,
  ChevronDown,
  Download,
  FileText,
  KeyRound,
  Megaphone,
  Save,
  ScrollText,
  Settings,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PACKAGES } from "@/lib/config";
import { apiFetch } from "@/lib/client-api";

type AdminSection = "overview" | "create" | "cards" | "announcement" | "rules" | "records";

type Overview = {
  stats: { users: number; tasks: number; cardsUnused: number; cardsRedeemed: number };
  users: Array<{ id: number; account: string; role: string; points: number; expires_at: string | null; created_at: string }>;
  tasks: Array<{
    id: string;
    user_id: number;
    source_type: string;
    input_chars: number;
    cost_points: number;
    status: string;
    error: string | null;
    created_at: string;
  }>;
};

type CardsData = {
  batches: Array<{
    id: number;
    name: string;
    points: number;
    role: string;
    validity_days: number | null;
    quantity: number;
    unused_count: number;
    redeemed_count: number;
    created_at: string;
  }>;
  recentCards: Array<{
    id: number;
    batch_id: number;
    batch_name: string | null;
    code_preview: string;
    points: number;
    role: string;
    validity_days: number | null;
    status: string;
    redeemed_by: number | null;
    redeemed_account: string | null;
    redeemed_at: string | null;
    expires_at: string | null;
    created_at: string;
  }>;
};

type PromptData = {
  rules: string;
  defaultRules: string;
};

type AnnouncementData = {
  enabled: boolean;
  title: string;
  content: string;
  buttonText: string;
  buttonUrl: string;
  version: string;
  updatedAt: string;
};

const roleOptions = [
  { value: "user", label: "普通用户卡密", description: "购买用户登录主页并使用润色额度" },
  { value: "admin", label: "管理员专属卡密", description: "进入后台生成卡密、管理规则和查看数据" },
];

const sections: Array<{ id: AdminSection; label: string; description: string; Icon: LucideIcon }> = [
  { id: "overview", label: "总览", description: "核心数据", Icon: BadgeCheck },
  { id: "create", label: "生成卡密", description: "新批次", Icon: KeyRound },
  { id: "cards", label: "卡密管理", description: "批次和状态", Icon: Ticket },
  { id: "announcement", label: "网站公告", description: "弹窗发布", Icon: Megaphone },
  { id: "rules", label: "规则配置", description: "润色指令", Icon: Settings },
  { id: "records", label: "记录用户", description: "任务和用户", Icon: Users },
];

export default function AdminPage() {
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [cards, setCards] = useState<CardsData | null>(null);
  const [promptData, setPromptData] = useState<PromptData | null>(null);
  const [announcementData, setAnnouncementData] = useState<AnnouncementData | null>(null);
  const [points, setPoints] = useState(String(PACKAGES[0]?.points || 4));
  const [quantity, setQuantity] = useState("10");
  const [name, setName] = useState("轻量体验卡");
  const [role, setRole] = useState("user");
  const [createdCodes, setCreatedCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [promptMessage, setPromptMessage] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [cardMessage, setCardMessage] = useState("");
  const [selectOpen, setSelectOpen] = useState<"points" | "role" | null>(null);

  const selectedPackage = PACKAGES.find((item) => String(item.points) === points) || PACKAGES[0];
  const selectedRole = roleOptions.find((item) => item.value === role) || roleOptions[0];
  const effectivePoints = role === "admin" ? 999 : Number(points);
  const effectiveValidity = role === "admin" ? null : selectedPackage?.validityDays || null;

  const stats: Array<[string, number, LucideIcon]> = [
    ["用户", overview?.stats.users || 0, Users],
    ["润色任务", overview?.stats.tasks || 0, FileText],
    ["未兑换卡", overview?.stats.cardsUnused || 0, Ticket],
    ["已兑换卡", overview?.stats.cardsRedeemed || 0, BadgeCheck],
  ];

  async function refresh() {
    const [overviewBody, cardsBody, promptBody, announcementBody] = await Promise.all([
      apiFetch("/api/admin/overview").then((response) => response.json()),
      apiFetch("/api/admin/cards").then((response) => response.json()),
      apiFetch("/api/admin/prompt").then((response) => response.json()),
      apiFetch("/api/admin/announcement").then((response) => response.json()),
    ]);

    if (!overviewBody.ok || !cardsBody.ok || !promptBody.ok || !announcementBody.ok) {
      window.location.assign("/login/");
      return;
    }
    setOverview(overviewBody.data);
    setCards(cardsBody.data);
    setPromptData(promptBody.data);
    setAnnouncementData(announcementBody.data.announcement);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const [overviewBody, cardsBody, promptBody, announcementBody] = await Promise.all([
        apiFetch("/api/admin/overview").then((response) => response.json()),
        apiFetch("/api/admin/cards").then((response) => response.json()),
        apiFetch("/api/admin/prompt").then((response) => response.json()),
        apiFetch("/api/admin/announcement").then((response) => response.json()),
      ]);

      if (!active) {
        return;
      }
      if (!overviewBody.ok || !cardsBody.ok || !promptBody.ok || !announcementBody.ok) {
        window.location.assign("/login/");
        return;
      }
      setOverview(overviewBody.data);
      setCards(cardsBody.data);
      setPromptData(promptBody.data);
      setAnnouncementData(announcementBody.data.announcement);
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  async function createCards() {
    setMessage("");
    setCreatedCodes([]);
    const body = await apiFetch("/api/admin/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, points: effectivePoints, quantity: Number(quantity), role }),
    }).then((response) => response.json());

    if (!body.ok) {
      setMessage(body.message);
      return;
    }

    setCreatedCodes(body.data.codes);
    setMessage(`已生成 ${body.data.codes.length} 张卡密。明文只显示本次，请立即导出保存。`);
    refresh();
  }

  function downloadCodes() {
    const blob = new Blob([createdCodes.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cards-${effectivePoints}points-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function savePromptRules() {
    setPromptMessage("");
    const body = await apiFetch("/api/admin/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: promptData?.rules || "" }),
    }).then((response) => response.json());

    if (!body.ok) {
      setPromptMessage(body.message);
      return;
    }

    setPromptData((current) => current ? { ...current, rules: body.data.rules } : current);
    setPromptMessage("润色规则已保存，下一次润色会使用新规则。");
  }

  async function saveAnnouncement() {
    setAnnouncementMessage("");
    const body = await apiFetch("/api/admin/announcement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(announcementData),
    }).then((response) => response.json());

    if (!body.ok) {
      setAnnouncementMessage(body.message);
      return;
    }

    setAnnouncementData(body.data.announcement);
    setAnnouncementMessage(body.data.announcement.enabled ? "公告已发布，前台会按新版本弹窗展示。" : "公告已保存为未发布状态。");
  }

  async function updateCardStatus(id: number, action: "void" | "restore") {
    setCardMessage("");
    const body = await apiFetch("/api/admin/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    }).then((response) => response.json());

    if (!body.ok) {
      setCardMessage(body.message);
      return;
    }

    setCardMessage(action === "void" ? "卡密已作废。" : "卡密已恢复为未兑换。");
    refresh();
  }

  if (!overview || !cards || !promptData || !announcementData) {
    return <main className="shell py-10">加载中...</main>;
  }

  return (
    <main className="admin-shell min-h-screen py-6">
      <nav className="admin-nav shell flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <Image className="brand-logo" src="/brand-logo.png" alt="论文降AIGC" width={176} height={60} priority />
        </Link>
        <Link href="/#editor" className="button-primary px-4 py-2 text-sm">
          返回主页
        </Link>
      </nav>

      <section className="shell py-8">
        <div className="admin-hero">
          <div>
            <p className="admin-kicker">后台控制台</p>
            <h1 className="text-4xl font-black">管理后台</h1>
            <p className="mt-2 muted">卡密生成后长期有效，用户兑换后才开始计算服务期。</p>
          </div>
          <div className="admin-hero-badge">
            <KeyRound size={18} />
            卡密体系
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {stats.map(([label, value, Icon]) => (
            <div key={label} className="admin-stat-card">
              <div className="flex items-center justify-between">
                <p className="text-sm muted">{label}</p>
                <span className="admin-stat-icon">
                  <Icon size={18} />
                </span>
              </div>
              <p className="mt-2 text-3xl font-black">{value}</p>
            </div>
          ))}
        </div>

        <div className="admin-section-tabs mt-6">
          {sections.map(({ id, label, description, Icon }) => (
            <button
              key={id}
              className={activeSection === id ? "admin-section-tab admin-section-tab-active" : "admin-section-tab"}
              onClick={() => setActiveSection(id)}
              type="button"
            >
              <Icon size={18} />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="admin-section-body mt-5">
          {activeSection === "overview" && (
            <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
              <AdminPanel title="卡密概况" badge="兑换后计时">
                <InfoGrid
                  items={[
                    ["未兑换卡", `${overview.stats.cardsUnused} 张`],
                    ["已兑换卡", `${overview.stats.cardsRedeemed} 张`],
                    ["普通卡有效期", "5元卡兑换后7天，9.9元卡兑换后30天"],
                    ["未兑换卡", "长期有效，不再选择日期过期"],
                  ]}
                />
              </AdminPanel>
              <AdminPanel title="近期任务" badge="最近50条">
                <TaskTable tasks={overview.tasks.slice(0, 8)} />
              </AdminPanel>
            </div>
          )}

          {activeSection === "create" && (
            <AdminPanel title="生成卡密" badge="明文仅显示本次">
              <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
                <div>
                  <label className="block text-sm font-semibold">批次名称</label>
                  <input className="field mt-2 w-full px-4 py-3" value={name} onChange={(event) => setName(event.target.value)} />

                  <label className="mt-4 block text-sm font-semibold">卡密权限</label>
                  <AdminSelect
                    open={selectOpen === "role"}
                    onToggle={() => setSelectOpen(selectOpen === "role" ? null : "role")}
                    value={selectedRole.label}
                    detail={selectedRole.description}
                    options={roleOptions}
                    selectedValue={role}
                    onSelect={(next) => {
                      setRole(next);
                      setSelectOpen(null);
                    }}
                  />

                  {role === "user" && (
                    <>
                      <label className="mt-4 block text-sm font-semibold">套餐</label>
                      <AdminSelect
                        open={selectOpen === "points"}
                        onToggle={() => setSelectOpen(selectOpen === "points" ? null : "points")}
                        value={selectedPackage ? `${selectedPackage.price}元 · ${selectedPackage.name}` : "选择套餐"}
                        detail={selectedPackage ? `${selectedPackage.points}点 · 兑换后${selectedPackage.validityDays}天` : ""}
                        options={PACKAGES.map((item) => ({
                          value: String(item.points),
                          label: `${item.price}元 · ${item.name}`,
                          description: `${item.points}点 · 兑换后${item.validityDays}天 · ${item.quotaText}`,
                        }))}
                        selectedValue={points}
                        onSelect={(next) => {
                          setPoints(next);
                          setSelectOpen(null);
                        }}
                      />
                    </>
                  )}

                  <label className="mt-4 block text-sm font-semibold">数量</label>
                  <input className="field mt-2 w-full px-4 py-3" value={quantity} onChange={(event) => setQuantity(event.target.value)} />

                  <div className="admin-hint mt-4">
                    <strong>当前设置</strong>
                    <span>
                      {effectivePoints} 点 · {role === "admin" ? "管理员长期有效" : `兑换后 ${effectiveValidity} 天，未兑换长期有效`}
                    </span>
                  </div>

                  {message && <p className="admin-message">{message}</p>}
                  <button className="button-primary mt-5 w-full px-4 py-3" onClick={createCards} type="button">
                    生成卡密
                  </button>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="font-black">本次生成结果</p>
                    <button className="button-secondary flex items-center gap-2 px-4 py-2 text-sm" onClick={downloadCodes} disabled={!createdCodes.length} type="button">
                      <Download size={16} />
                      导出
                    </button>
                  </div>
                  <textarea
                    className="field h-[360px] w-full px-3 py-3 font-mono text-sm"
                    readOnly
                    value={createdCodes.length ? createdCodes.join("\n") : "生成后这里显示完整卡密，离开页面后不可再次查看明文。"}
                  />
                </div>
              </div>
            </AdminPanel>
          )}

          {activeSection === "cards" && (
            <div className="space-y-5">
              <AdminPanel title="卡密批次" badge="最近20批">
                <div className="overflow-auto">
                  <table className="admin-table w-full min-w-[760px] text-left text-sm">
                    <thead className="text-[#777]">
                      <tr>
                        <th className="py-2">批次</th>
                        <th>点数</th>
                        <th>权限</th>
                        <th>服务期</th>
                        <th>总数</th>
                        <th>未兑换</th>
                        <th>已兑换</th>
                        <th>创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cards.batches.map((item) => (
                        <tr key={item.id} className="border-t border-[#eeeeee]">
                          <td className="py-3">{item.name}</td>
                          <td>{item.points}</td>
                          <td><RolePill role={item.role} /></td>
                          <td>{formatValidity(item.validity_days, item.role)}</td>
                          <td>{item.quantity}</td>
                          <td>{item.unused_count}</td>
                          <td>{item.redeemed_count}</td>
                          <td>{item.created_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AdminPanel>

              <AdminPanel title="卡密列表" badge="最近100张">
                <p className="mb-4 text-sm leading-7 text-[#777]">
                  未兑换卡长期有效；兑换后会写入用户服务期和卡密到期时间。完整卡密只在生成时显示一次。
                </p>
                {cardMessage && <p className="admin-message">{cardMessage}</p>}
                <div className="overflow-auto">
                  <table className="admin-table w-full min-w-[1080px] text-left text-sm">
                    <thead className="text-[#777]">
                      <tr>
                        <th className="py-2">卡密预览</th>
                        <th>批次</th>
                        <th>点数</th>
                        <th>权限</th>
                        <th>状态</th>
                        <th>服务期</th>
                        <th>兑换账号</th>
                        <th>到期时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cards.recentCards.map((item) => (
                        <tr key={item.id} className="border-t border-[#eeeeee]">
                          <td className="py-3 font-mono">{item.code_preview}</td>
                          <td>{item.batch_name || `批次 ${item.batch_id}`}</td>
                          <td>{item.points}</td>
                          <td><RolePill role={item.role} /></td>
                          <td><span className={cardStatusClassName(item.status)}>{formatCardStatus(item.status)}</span></td>
                          <td>{formatValidity(item.validity_days, item.role)}</td>
                          <td>{item.redeemed_account || "-"}</td>
                          <td>{formatCardExpiry(item)}</td>
                          <td>
                            {item.status === "unused" && (
                              <button className="admin-text-button danger" onClick={() => updateCardStatus(item.id, "void")} type="button">
                                作废
                              </button>
                            )}
                            {(item.status === "void" || item.status === "expired") && (
                              <button className="admin-text-button" onClick={() => updateCardStatus(item.id, "restore")} type="button">
                                恢复
                              </button>
                            )}
                            {item.status === "redeemed" && <span className="text-[#999]">已锁定</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AdminPanel>
            </div>
          )}

          {activeSection === "announcement" && (
            <AdminPanel title="网站弹窗公告" badge={announcementData.enabled ? "发布中" : "未发布"}>
              <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
                <div>
                  <div className="announcement-admin-switch">
                    <div>
                      <strong>前台弹窗公告</strong>
                      <span>{announcementData.enabled ? "已开启，用户进入首页会看到公告" : "已关闭，前台不会显示公告"}</span>
                    </div>
                    <button
                      className={announcementData.enabled ? "pane-switch-button pane-switch-active" : "pane-switch-button"}
                      onClick={() => setAnnouncementData({ ...announcementData, enabled: !announcementData.enabled })}
                      type="button"
                      aria-pressed={announcementData.enabled}
                    >
                      <div className={announcementData.enabled ? "switch" : "switch switch-off"}>
                        <div className={announcementData.enabled ? "switch-dot" : "switch-dot switch-dot-off"} />
                      </div>
                      {announcementData.enabled ? "开启" : "关闭"}
                    </button>
                  </div>

                  <label className="mt-4 block text-sm font-semibold">公告标题</label>
                  <input
                    className="field mt-2 w-full px-4 py-3"
                    value={announcementData.title}
                    onChange={(event) => setAnnouncementData({ ...announcementData, title: event.target.value })}
                    placeholder="例如：服务更新公告"
                  />

                  <label className="mt-4 block text-sm font-semibold">公告内容</label>
                  <textarea
                    className="field announcement-admin-textarea mt-2 w-full px-4 py-3 text-sm"
                    value={announcementData.content}
                    onChange={(event) => setAnnouncementData({ ...announcementData, content: event.target.value })}
                    placeholder="写给用户看的公告内容，支持换行展示。"
                  />

                  <div className="mt-4 grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
                    <div>
                      <label className="block text-sm font-semibold">按钮文案</label>
                      <input
                        className="field mt-2 w-full px-4 py-3"
                        value={announcementData.buttonText}
                        onChange={(event) => setAnnouncementData({ ...announcementData, buttonText: event.target.value })}
                        placeholder="我知道了"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold">按钮链接</label>
                      <input
                        className="field mt-2 w-full px-4 py-3"
                        value={announcementData.buttonUrl}
                        onChange={(event) => setAnnouncementData({ ...announcementData, buttonUrl: event.target.value })}
                        placeholder="/login 或 https://..."
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="button-primary flex items-center gap-2 px-5 py-3 text-sm" onClick={saveAnnouncement} type="button">
                      <Save size={16} />
                      保存并更新版本
                    </button>
                    <button
                      className="button-secondary px-5 py-3 text-sm font-bold"
                      onClick={() =>
                        setAnnouncementData({
                          ...announcementData,
                          enabled: false,
                          title: "网站公告",
                          content: "",
                          buttonText: "我知道了",
                          buttonUrl: "",
                        })
                      }
                      type="button"
                    >
                      清空草稿
                    </button>
                  </div>
                  {announcementMessage && <p className="admin-message">{announcementMessage}</p>}
                </div>

                <div>
                  <p className="mb-3 text-sm font-black text-[#111]">弹窗预览</p>
                  <div className="announcement-preview">
                    <span className="announcement-preview-badge">
                      <Megaphone size={15} />
                      网站公告
                    </span>
                    <h3>{announcementData.title || "网站公告"}</h3>
                    <div className="announcement-preview-content">
                      {(announcementData.content || "这里会展示公告正文。用户关闭后，同一版本不会重复弹出；保存发布会生成新版本。").split(/\n+/).map((paragraph, index) => (
                        <p key={`${index}-${paragraph}`}>{paragraph}</p>
                      ))}
                    </div>
                    <div className="announcement-preview-actions">
                      <span>{announcementData.buttonUrl ? announcementData.buttonUrl : "无跳转链接"}</span>
                      <strong>{announcementData.buttonText || "我知道了"}</strong>
                    </div>
                  </div>
                  <div className="admin-hint mt-4">
                    <strong>版本信息</strong>
                    <span>当前版本：{announcementData.version || "-"}</span>
                    <span>更新时间：{announcementData.updatedAt || "未保存"}</span>
                  </div>
                </div>
              </div>
            </AdminPanel>
          )}

          {activeSection === "rules" && (
            <AdminPanel title="润色规则配置" badge="实时生效">
              <p className="mb-3 text-sm leading-7 text-[#777]">
                检测平台规则变化后，在这里更新降 AIGC 指令即可。保存后，新的润色任务会使用最新规则。
              </p>
              <textarea
                className="field admin-rules-textarea w-full px-4 py-3 text-sm"
                value={promptData.rules}
                onChange={(event) => setPromptData({ ...promptData, rules: event.target.value })}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="button-primary flex items-center gap-2 px-5 py-3 text-sm" onClick={savePromptRules} type="button">
                  <Save size={16} />
                  保存规则
                </button>
                <button
                  className="button-secondary px-5 py-3 text-sm font-bold"
                  onClick={() => setPromptData({ ...promptData, rules: promptData.defaultRules })}
                  type="button"
                >
                  恢复默认
                </button>
              </div>
              {promptMessage && <p className="admin-message">{promptMessage}</p>}
            </AdminPanel>
          )}

          {activeSection === "records" && (
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <AdminPanel title="用户" badge="最近50个">
                <div className="overflow-auto">
                  <table className="admin-table w-full min-w-[700px] text-left text-sm">
                    <thead className="text-[#777]">
                      <tr>
                        <th className="py-2">账号</th>
                        <th>权限</th>
                        <th>点数</th>
                        <th>服务到期</th>
                        <th>创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.users.map((item) => (
                        <tr key={item.id} className="border-t border-[#eeeeee]">
                          <td className="py-3 font-mono">{item.account}</td>
                          <td><RolePill role={item.role} /></td>
                          <td>{item.points}</td>
                          <td>{item.role === "admin" ? "长期有效" : item.expires_at || "-"}</td>
                          <td>{item.created_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AdminPanel>
              <AdminPanel title="润色任务" badge="24小时内">
                <TaskTable tasks={overview.tasks} />
              </AdminPanel>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function AdminPanel({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <div className="admin-panel p-5">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="font-black">{title}</h2>
        {badge && <span className="admin-soft-pill">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="admin-info-cell">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function TaskTable({ tasks }: { tasks: Overview["tasks"] }) {
  return (
    <div className="overflow-auto">
      <table className="admin-table w-full min-w-[760px] text-left text-sm">
        <thead className="text-[#777]">
          <tr>
            <th className="py-2">用户</th>
            <th>来源</th>
            <th>字数</th>
            <th>扣点</th>
            <th>状态</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((item) => (
            <tr key={item.id} className="border-t border-[#eeeeee]">
              <td className="py-3">{item.user_id}</td>
              <td>{formatSource(item.source_type)}</td>
              <td>{item.input_chars}</td>
              <td>{item.cost_points}</td>
              <td><span className={statusClassName(item.status)}>{formatStatus(item.status)}</span></td>
              <td>{item.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RolePill({ role }: { role: string }) {
  return <span className={role === "admin" ? "role-pill role-pill-admin" : "role-pill"}>{formatRole(role)}</span>;
}

function AdminSelect({
  open,
  value,
  detail,
  options,
  selectedValue,
  onToggle,
  onSelect,
}: {
  open: boolean;
  value: string;
  detail: string;
  options: Array<{ value: string; label: string; description: string }>;
  selectedValue: string;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="admin-select-wrap">
      <button className={open ? "admin-select admin-select-open" : "admin-select"} onClick={onToggle} type="button">
        <span>
          <strong>{value}</strong>
          <small>{detail}</small>
        </span>
        <ChevronDown className="admin-select-chevron" size={18} />
      </button>
      {open && (
        <div className="admin-select-menu">
          {options.map((item) => (
            <button
              key={item.value}
              className={selectedValue === item.value ? "admin-select-option admin-select-option-active" : "admin-select-option"}
              onClick={() => onSelect(item.value)}
              type="button"
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatRole(role: string) {
  return role === "admin" ? "管理员" : "用户";
}

function formatValidity(validityDays: number | null, role: string) {
  if (role === "admin") {
    return "长期有效";
  }
  return validityDays ? `兑换后${validityDays}天` : "未设置";
}

function formatCardExpiry(item: { status: string; expires_at: string | null; role: string }) {
  if (item.role === "admin") {
    return "长期有效";
  }
  if (item.status === "unused") {
    return "未兑换长期有效";
  }
  return item.expires_at || "-";
}

function formatSource(source: string) {
  if (source === "document") {
    return "文档";
  }
  if (source === "text") {
    return "文本";
  }
  return source || "-";
}

function formatStatus(status: string) {
  if (status === "success") {
    return "成功";
  }
  if (status === "failed") {
    return "失败";
  }
  if (status === "processing") {
    return "处理中";
  }
  if (status === "pending") {
    return "待处理";
  }
  return status || "-";
}

function statusClassName(status: string) {
  if (status === "success") {
    return "status-pill status-pill-success";
  }
  if (status === "failed") {
    return "status-pill status-pill-failed";
  }
  return "status-pill";
}

function formatCardStatus(status: string) {
  if (status === "unused") {
    return "未兑换";
  }
  if (status === "redeemed") {
    return "已兑换";
  }
  if (status === "void") {
    return "已作废";
  }
  if (status === "expired") {
    return "已过期";
  }
  return status || "-";
}

function cardStatusClassName(status: string) {
  if (status === "redeemed") {
    return "status-pill status-pill-success";
  }
  if (status === "void" || status === "expired") {
    return "status-pill status-pill-failed";
  }
  return "status-pill";
}
