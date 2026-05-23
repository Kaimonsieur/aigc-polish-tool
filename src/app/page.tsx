"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  Loader2,
  LogOut,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { DEFAULT_REWRITE_MODE, REWRITE_MODES, RewriteMode } from "@/lib/config";
import { apiFetch, buildDownloadUrl, setSessionToken } from "@/lib/client-api";
import { buildDiffParts, type DiffPart } from "@/lib/diff";
import { TypewriterTitle } from "@/components/TypewriterTitle";

type RewriteResponse = {
  taskId: string;
  status: "pending" | "processing" | "success" | "failed";
  output?: string;
  outputPreview?: string;
  outputTruncated?: boolean;
  renderMode: "inline" | "backend";
  inputChars: number;
  outputChars: number;
  costPoints: number;
  usedFree: boolean;
  error?: string;
  segmentCount?: number;
  inputText?: string;
};

type DialogType = "privacy" | "terms" | "feedback" | "contact" | null;
type EditingPane = "source" | "result" | null;
const INLINE_DIFF_CHAR_LIMIT = 900;
const POLL_INTERVAL_MS = 1800;

type MeData = {
  user: { account: string; points: number; role: "user" | "admin"; created_at: string } | null;
  freeUsedToday?: number;
  retentionHours?: number;
  usage?: Array<{
    id: string;
    source_type: string;
    input_chars: number;
    cost_points: number;
    used_free: number;
    status: string;
    created_at: string;
  }>;
};

const platforms = [
  { name: "知网", src: "/platform/logo-cnki.webp" },
  { name: "维普", src: "/platform/logo-vpcs.webp" },
  { name: "万方", src: "/platform/logo-wanfang.webp" },
  { name: "Turnitin", src: "/platform/turnitin-logo.webp" },
  { name: "PaperYY", src: "/platform/logo-paperyy.webp" },
  { name: "格子达", src: "/platform/gezida_logo.png" },
  { name: "大雅", src: "/platform/daya_logo.webp", dark: true },
  { name: "集笔AI检测助手", src: "/platform/logo-zhuque.webp" },
  { name: "Master AI", src: "/platform/master_ai_logo.webp" },
  { name: "PaperBye", src: "/platform/paperbye_logo.webp" },
];

const sampleOriginal =
  "在当前高校课程建设过程中，人工智能技术的应用已经成为推动教学模式转型的重要因素。教师可以依托智能平台完成学习数据分析、课程资源推荐和作业反馈等工作，从而提升教学管理的精细化水平。与此同时，学生在使用生成式工具完成资料检索和论文写作时，也能够获得更加便捷的学习支持。总体来看，人工智能技术的融入有助于优化教学流程、提升学习效率，并为高校教育数字化发展提供新的实践路径。";

const sampleRewritten =
  "现在高校在建设课程的时候，人工智能技术用得比较多，它也慢慢成了推动教学方式变化的一个因素。教师可以借助智能平台去分析学生学习数据，推荐一些课程资料，也可以给作业反馈提供帮助，这样教学管理会更细一些；学生在查资料和写论文的时候，也会使用生成式工具，这些工具确实能让学习方便一点。总体来说，人工智能进入教学之后，可以让教学流程更顺，也能提高一点学习效率，对高校教育数字化发展有一定帮助。";

const features = [
  {
    no: "01",
    title: "按段落润色",
    body: "尽量保持原文字数和段落位置，只调整语序、句式和常见机器感表达。",
    Icon: WandSparkles,
  },
  {
    no: "02",
    title: "卡密使用",
    body: "购买卡密后直接登录使用，自动扣点，失败自动退点，不需要手动加点。",
    Icon: BadgeCheck,
  },
  {
    no: "03",
    title: "24小时记录",
    body: "润色结果和文档只保留24小时，期间可凭卡密查询和下载，过期后自动删除。",
    Icon: ShieldCheck,
  },
  {
    no: "04",
    title: "文档上传",
    body: "支持 Word、PDF、TXT 提取正文处理，只保证文本段落顺序，不保证原排版。",
    Icon: FileText,
  },
];

const faqs = [
  [
    "什么是 AI 文本检测（AIGC 检测）？",
    "AIGC 检测通常会根据词语搭配、语序规律、句式结构和重复表达等特征，判断文本是否可能由人工智能生成。本工具主要通过调整文本句法结构和表达方式，弱化容易被识别的机器感。",
  ],
  [
    "能保证 100% 通过所有平台的检测吗？",
    "不能保证。不同平台的检测规则和更新频率不同，文本本身也有差异。润色结果只能作为表达优化和降低机器感的辅助，不承诺任何平台结果。",
  ],
  [
    "降 AIGC 处理后，文本质量、意思和字数会发生变化吗？",
    "系统会尽量保留原意和主要信息，字数保持大致接近。为了弱化机器感，部分句式、语序和词语会被调整，文风会更平实。",
  ],
  ["额度是如何计算的？", "按输入字数扣点，5000字以内扣1点，超过后按档位扣点。接口失败或处理失败会自动退回点数。"],
  ["单次改写的文本长度有限制吗？", "单次最多处理30000字。长文档建议拆分章节处理，方便检查润色结果。"],
  ["我的论文隐私如何保障？", "润色记录和文档只保留24小时，过期后自动删除。请在24小时内完成查询和下载。"],
];

function countChars(text: string) {
  return Array.from(text.replace(/\s/g, "")).length;
}

async function parseJson<T>(response: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  return response.json();
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function DiffMainView({
  title,
  hint,
  parts,
  side,
  onEdit,
}: {
  title: string;
  hint: string;
  parts: DiffPart[];
  side: "source" | "result";
  onEdit: () => void;
}) {
  return (
    <button className={`diff-main-view diff-main-view-${side}`} onClick={onEdit} type="button">
      <span className="diff-main-head">
        <span>
          <span className="diff-main-title">{title}</span>
          <span className="diff-main-hint">{hint}</span>
        </span>
        <span className="diff-main-action">点击编辑</span>
      </span>
      <span className="diff-main-text">
        {parts.map((part, index) => (
          <span
            key={`${part.type || "same"}-${index}`}
            className={part.type === "add" ? "diff-add" : part.type === "remove" ? "diff-remove" : undefined}
          >
            {part.text}
          </span>
        ))}
      </span>
    </button>
  );
}

export default function Home() {
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const rewriteAbortRef = useRef<AbortController | null>(null);
  const rewriteRunRef = useRef(0);
  const [text, setText] = useState(sampleOriginal);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<RewriteMode>(DEFAULT_REWRITE_MODE);
  const [result, setResult] = useState<RewriteResponse | null>({
    taskId: "",
    status: "success",
    output: sampleRewritten,
    outputPreview: sampleRewritten,
    outputTruncated: false,
    renderMode: "inline",
    inputChars: countChars(sampleOriginal),
    outputChars: countChars(sampleRewritten),
    costPoints: 0,
    usedFree: true,
    segmentCount: 1,
  });
  const [resultText, setResultText] = useState(sampleRewritten);
  const [submittedText, setSubmittedText] = useState(sampleOriginal);
  const [loading, setLoading] = useState(false);
  const [processingText, setProcessingText] = useState("");
  const [message, setMessage] = useState("");
  const [showDiff, setShowDiff] = useState(true);
  const [editingPane, setEditingPane] = useState<EditingPane>(null);
  const [openFaq, setOpenFaq] = useState(0);
  const [dialog, setDialog] = useState<DialogType>(null);
  const [feedback, setFeedback] = useState("");
  const [contact, setContact] = useState("");
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [me, setMe] = useState<MeData | null>(null);
  const [recordsOpen, setRecordsOpen] = useState(false);

  const chars = useMemo(() => countChars(text), [text]);
  const taskDone = result?.status === "success";
  const taskFailed = result?.status === "failed";
  const resultReady = taskDone && Boolean(resultText);
  const diffBaseText = text || submittedText;
  const inlineDiffAllowed =
    showDiff &&
    resultReady &&
    Boolean(resultText && diffBaseText) &&
    countChars(diffBaseText) <= INLINE_DIFF_CHAR_LIMIT &&
    countChars(resultText) <= INLINE_DIFF_CHAR_LIMIT;
  const diff = useMemo(
    () =>
      resultText && diffBaseText && inlineDiffAllowed
        ? buildDiffParts(diffBaseText, resultText)
        : null,
    [diffBaseText, inlineDiffAllowed, resultText],
  );
  const diffSkipped = Boolean(diff?.skipped || (showDiff && resultReady && diffBaseText && !inlineDiffAllowed));
  const leftDiffParts = diff?.removed || null;
  const rightDiffParts = diff?.added || null;
  const showSourceDiff = Boolean(showDiff && leftDiffParts && editingPane !== "source" && !file);
  const showResultDiff = Boolean(showDiff && rightDiffParts && editingPane !== "result" && !loading && !taskFailed);
  const currentDownloadText = resultText.trim();

  async function refreshMe() {
    const body = await apiFetch("/api/me").then((response) => response.json());
    if (body.ok) {
      setMe(body.data);
    }
  }

  async function loadResultText(task: RewriteResponse, signal: AbortSignal) {
    if (task.status !== "success") {
      setResultText("");
      return;
    }

    const inlineText = task.output || task.outputPreview || "";
    if (inlineText) {
      setResultText(inlineText);
    }

    if (!task.taskId) {
      return;
    }

    const response = await apiFetch(`/api/result/text?id=${encodeURIComponent(task.taskId)}`, { signal });
    if (!response.ok) {
      if (!inlineText) {
        throw new Error("完整结果读取失败");
      }
      return;
    }
    setResultText(await response.text());
  }

  function downloadEditedText(kind: "txt" | "docx") {
    if (!currentDownloadText || !result?.taskId) return;
    const fileBase = `aigc-polish-${result.taskId}`;

    if (kind === "txt") {
      const blob = new Blob([resultText], { type: "text/plain;charset=utf-8" });
      triggerDownload(blob, `${fileBase}.txt`);
      return;
    }

    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${resultText
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
      .join("")}</body></html>`;
    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    triggerDownload(blob, `${fileBase}.doc`);
  }

  function triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  useEffect(() => {
    let active = true;
    async function loadMe() {
      const body = await apiFetch("/api/me").then((response) => response.json());
      if (active && body.ok) {
        setMe(body.data);
      }
    }
    loadMe();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function syncHeroVideo() {
      const video = heroVideoRef.current;
      if (!video) return;

      if (window.scrollY > window.innerHeight * 0.35) {
        video.pause();
      } else {
        video.play().catch(() => {
          // Autoplay can be blocked by the browser; the page still works without it.
        });
      }
    }

    syncHeroVideo();
    window.addEventListener("scroll", syncHeroVideo, { passive: true });
    return () => window.removeEventListener("scroll", syncHeroVideo);
  }, []);

  useEffect(() => {
    return () => rewriteAbortRef.current?.abort();
  }, []);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setEditingPane(null);
    if (selected) {
      setText("");
      setResult(null);
      setResultText("");
      setSubmittedText("");
    }
  }

  async function startRewrite() {
    const currentFile = file;
    const currentText = text;
    const submittedSnapshot =
      !currentFile && countChars(currentText) <= INLINE_DIFF_CHAR_LIMIT ? currentText : "";
    const runId = rewriteRunRef.current + 1;
    rewriteRunRef.current = runId;
    rewriteAbortRef.current?.abort();
    const controller = new AbortController();
    rewriteAbortRef.current = controller;

    setLoading(true);
    setProcessingText("正在提交润色任务...");
    setMessage("");
    setCopying(false);
    setResult(null);
    setResultText("");
    setSubmittedText(submittedSnapshot);
    setEditingPane(null);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (controller.signal.aborted || rewriteRunRef.current !== runId) return;

    try {
      let response: Response;
      if (currentFile) {
        const form = new FormData();
        form.append("file", currentFile);
        form.append("mode", mode);
        response = await apiFetch("/api/rewrite", { method: "POST", body: form, signal: controller.signal });
      } else {
        response = await apiFetch("/api/rewrite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: currentText, mode }),
          signal: controller.signal,
        });
      }

      const body = await parseJson<RewriteResponse>(response);
      if (controller.signal.aborted || rewriteRunRef.current !== runId) return;
      if (!body.ok) {
        setMessage(body.message.includes("请先登录") ? "请先使用卡密登录后再开始润色" : body.message);
        if (body.message.includes("请先登录")) {
          window.location.assign("/login");
        }
        return;
      }

      if (currentFile && body.data.inputText) {
        setText(body.data.inputText);
        setFile(null);
        setSubmittedText(countChars(body.data.inputText) <= INLINE_DIFF_CHAR_LIMIT ? body.data.inputText : "");
      }
      if (!currentFile) {
        setSubmittedText(countChars(currentText) <= INLINE_DIFF_CHAR_LIMIT ? currentText : "");
      }
      setResult(body.data);
      setProcessingText("任务已提交，正在后台润色...");

      let latest = body.data;
      while (
        !controller.signal.aborted &&
        rewriteRunRef.current === runId &&
        (latest.status === "pending" || latest.status === "processing")
      ) {
        await wait(POLL_INTERVAL_MS, controller.signal);
        if (controller.signal.aborted || rewriteRunRef.current !== runId) return;

        const statusResponse = await apiFetch(`/api/rewrite/status?id=${encodeURIComponent(latest.taskId)}`, {
          signal: controller.signal,
        });
        const statusBody = await parseJson<RewriteResponse>(statusResponse);
        if (controller.signal.aborted || rewriteRunRef.current !== runId) return;
        if (!statusBody.ok) {
          setMessage(statusBody.message);
          return;
        }

        latest = statusBody.data;
        setResult(latest);
        setProcessingText("后台正在处理，请稍候...");
      }

      if (latest.status === "failed") {
        setResultText("");
        setMessage(latest.error || "润色失败，已自动退回点数，请稍后重试。");
      } else if (latest.status === "success") {
        await loadResultText(latest, controller.signal);
      }

      refreshMe();
    } catch (error) {
      if (controller.signal.aborted || rewriteRunRef.current !== runId) return;
      setMessage("润色任务提交或查询失败，请稍后重试；已提交的任务可在24小时记录中查看。");
    } finally {
      if (rewriteRunRef.current === runId) {
        setLoading(false);
        setProcessingText("");
      }
      if (rewriteAbortRef.current === controller) {
        rewriteAbortRef.current = null;
      }
    }
  }

  function clearEditor() {
    rewriteAbortRef.current?.abort();
    rewriteRunRef.current += 1;
    setText("");
    setFile(null);
    setResult(null);
    setResultText("");
    setSubmittedText("");
    setEditingPane(null);
    setLoading(false);
    setProcessingText("");
    setMessage("");
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setSessionToken(null);
    setMe({ user: null });
    setRecordsOpen(false);
  }

  async function copyResult() {
    if (!currentDownloadText) return;
    setCopying(true);
    setMessage("");

    try {
      await navigator.clipboard.writeText(resultText);
      setMessage("已复制当前右侧结果。");
    } catch {
      setMessage("复制失败，请使用下方 TXT / DOCX 下载完整结果。");
    } finally {
      setCopying(false);
    }
  }

  return (
    <main>
      <div className="mobile-blocker">
        <div className="mobile-blocker-card">
          <Image className="brand-logo" src="/brand-logo.png" alt="论文降AIGC" width={176} height={60} priority />
          <h1>请前往电脑端使用</h1>
          <p>文档上传、双栏对比和长文本编辑需要更大的屏幕，当前移动端暂不开放处理入口。</p>
        </div>
      </div>

      <nav className="floating-nav">
        <div className="shell flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-3 font-bold">
            <Image className="brand-logo" src="/brand-logo.png" alt="论文降AIGC" width={176} height={60} priority />
          </Link>
          <div className="hidden items-center gap-2 md:flex">
            <a className="rounded-full px-4 py-2 text-sm font-semibold text-[#555] hover:bg-[#f5f5f5]" href="#editor">
              开始使用
            </a>
            <a className="rounded-full px-4 py-2 text-sm font-semibold text-[#555] hover:bg-[#f5f5f5]" href="#faq">
              常见问题
            </a>
            <button
              className="rounded-full px-4 py-2 text-sm font-semibold text-[#555] hover:bg-[#f5f5f5]"
              onClick={() => setDialog("feedback")}
              type="button"
            >
              意见反馈
            </button>
          </div>
          <Link href="/login" className="button-primary px-7 py-3 text-sm">
            卡密登录
          </Link>
        </div>
      </nav>

      <section className="hero-shell hero-video-shell">
        <video
          ref={heroVideoRef}
          className="hero-video"
          src="https://random-api.czl.net/video/dy-art"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
        <div className="hero-video-wash" />
        <div className="hero-content shell min-h-screen pb-8 pt-24">
          <div className="hero-copy flex max-w-4xl flex-col items-start pt-10 text-left md:pt-20">
            <p className="mb-5 rounded-full border border-white/50 bg-white/65 px-4 py-2 text-sm font-bold text-[#333] shadow-sm backdrop-blur">
              AIGC 文本润色 / 文档降机器感
            </p>
            <TypewriterTitle />
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-[#333]">
              一键弱化机器感特征，按普通论文写作习惯重组表达。
              <br className="hidden md:block" />
              支持粘贴文本，也支持上传文档处理正文段落。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#editor" className="button-primary inline-flex items-center gap-2 px-10 py-4">
                立即开始 <ArrowRight size={18} />
              </a>
              <Link href="/login" className="button-secondary bg-white/80 px-8 py-4 text-sm font-bold backdrop-blur">
                卡密登录
              </Link>
            </div>

            <div className="mt-10 max-w-3xl text-sm font-semibold leading-7 text-[#444]">
              覆盖主流 AIGC 检测场景，围绕文本机器感做自然化润色，不承诺任何平台检测结果。
            </div>
            <div className="platform-grid mt-6">
              {platforms.map((item) => (
                <div key={item.name} className={item.dark ? "platform-card platform-card-dark" : "platform-card"}>
                  <Image className="platform-logo" src={item.src} alt={item.name} width={112} height={32} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="editor" className="editor-section px-4 py-16">
        <div className="shell">
          <div className="account-strip">
            {me?.user ? (
              <>
                <div>
                  <p className="text-sm font-black text-[#111]">
                    {me.user.role === "admin" ? "管理员卡密" : "卡密用户"} · 剩余 {me.user.points} 点
                  </p>
                  <p className="mt-1 text-xs text-[#777]">
                    记录和文档保留 {me.retentionHours || 24} 小时，过期后自动删除
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {me.user.role === "admin" && (
                    <Link className="button-secondary px-4 py-2 text-sm font-bold" href="/admin">
                      管理后台
                    </Link>
                  )}
                  <button className="button-secondary px-4 py-2 text-sm font-bold" onClick={() => setRecordsOpen((value) => !value)} type="button">
                    24小时记录
                  </button>
                  <button className="button-secondary flex items-center gap-2 px-4 py-2 text-sm font-bold" onClick={logout} type="button">
                    <LogOut size={15} />
                    退出
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm font-black text-[#111]">使用卡密后开始正式润色</p>
                  <p className="mt-1 text-xs text-[#777]">同一卡密可在24小时内查询记录并下载 TXT / DOCX</p>
                </div>
                <Link className="button-primary px-5 py-2 text-sm" href="/login">
                  卡密登录
                </Link>
              </>
            )}
          </div>

          {recordsOpen && me?.usage && (
            <div className="record-panel">
              {me.usage.length ? (
                me.usage.map((item) => (
                  <div key={item.id} className="record-row">
                    <span>{item.source_type === "document" ? "文档" : "文本"}</span>
                    <span>{item.input_chars} 字</span>
                    <span>{item.used_free ? "免费" : `${item.cost_points} 点`}</span>
                    <span>{item.created_at}</span>
                    {item.status === "success" ? (
                      <span className="flex gap-3 font-bold text-[#111]">
                        <a href={buildDownloadUrl(`/api/download/txt?id=${item.id}`)}>TXT</a>
                        <a href={buildDownloadUrl(`/api/download/docx?id=${item.id}`)}>DOCX</a>
                      </span>
                    ) : (
                      <span className="text-[#999]">{item.status}</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#777]">暂无24小时内的润色记录。</p>
              )}
            </div>
          )}

          <div className="dual-editor">
            <div className="editor-pane">
              <div className="pane-head">
                <div className="flex items-center gap-3">
                  <span className="pane-label">原始文本</span>
                  <span className="meta-badge">{file ? "文档" : `${chars} 字`}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="button-secondary flex cursor-pointer items-center gap-2 px-4 py-2 text-sm">
                    <Upload size={16} />
                    导入文档
                    <input
                      className="hidden"
                      type="file"
                      accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                      onChange={onFileChange}
                    />
                  </label>
                  <button className="button-secondary flex items-center gap-2 px-4 py-2 text-sm" onClick={clearEditor} type="button">
                    <Trash2 size={16} />
                    清空
                  </button>
                  <button
                    className="button-primary flex items-center gap-2 px-5 py-2 text-sm"
                    onClick={startRewrite}
                    disabled={loading || (!file && !text.trim())}
                    type="button"
                  >
                    {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    {loading ? "润色中" : "开始改写"}
                  </button>
                </div>
              </div>
              <div className="pane-body pane-body-editor">
                {file ? (
                  <div className="rounded-2xl border border-dashed border-[#ddd] bg-[#fafafa] p-6">
                    <div className="flex items-center gap-2 font-bold">
                      <FileText size={18} />
                      {file.name}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[#777]">
                      系统将提取正文并润色，输出不保证字体、图片、表格、页眉页脚、分页和复杂排版完整保留。
                    </p>
                  </div>
                ) : (
                  <>
                    {showSourceDiff ? (
                      <DiffMainView
                        title="原文对比"
                        hint="红色标记为润色时被调整或移除的表达"
                        parts={leftDiffParts || []}
                        side="source"
                        onEdit={() => setEditingPane("source")}
                      />
                    ) : (
                      <textarea
                        autoFocus={editingPane === "source"}
                        className="pane-textarea"
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        onFocus={() => setEditingPane("source")}
                        placeholder="在此粘贴需要处理的论文段落..."
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="editor-pane">
              <div className="pane-head">
                <span className="pane-label">改写结果</span>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="flex items-center gap-2 text-sm font-semibold text-[#777]"
                    onClick={() => {
                      setShowDiff((value) => {
                        const next = !value;
                        if (next) {
                          setEditingPane(null);
                        }
                        return next;
                      });
                    }}
                    type="button"
                  >
                    <div className={showDiff ? "switch" : "switch bg-[#eee]"}>
                      <div className={showDiff ? "switch-dot" : "switch-dot left-[3px] right-auto"} />
                    </div>
                    对比
                  </button>
                  <div className="mode-select-wrap">
                    <button
                      className={modeMenuOpen ? "mode-select mode-select-open" : "mode-select"}
                      onClick={() => setModeMenuOpen((value) => !value)}
                      type="button"
                    >
                      <WandSparkles size={16} />
                      <span>{REWRITE_MODES[mode].label}</span>
                      <ChevronDown className="mode-select-chevron" size={16} />
                    </button>
                    {modeMenuOpen && (
                      <div className="mode-dropdown">
                        {(Object.keys(REWRITE_MODES) as RewriteMode[]).map((key) => (
                          <button
                            key={key}
                            className={mode === key ? "mode-option mode-option-active" : "mode-option"}
                            onClick={() => {
                              setMode(key);
                              setModeMenuOpen(false);
                            }}
                            type="button"
                          >
                            <span className="font-black">{REWRITE_MODES[key].label}</span>
                            <span>{REWRITE_MODES[key].description}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="button-secondary flex items-center gap-2 px-4 py-2 text-sm" disabled={!taskDone || !result?.taskId || copying} onClick={copyResult} type="button">
                    <Clipboard size={16} />
                    {copying ? "复制中" : "复制"}
                  </button>
                  <button
                    className="button-secondary flex items-center gap-2 px-4 py-2 text-sm"
                    disabled={!inlineDiffAllowed}
                    onClick={() => setEditingPane(null)}
                    type="button"
                  >
                    查看对比
                  </button>
                </div>
              </div>
              <div className="pane-body pane-body-editor">
                {loading ? (
                  <div className="editor-status">
                    <div className="flex items-center gap-3">
                      <Loader2 className="animate-spin text-[#111]" size={20} />
                      <p className="text-lg font-black text-[#111]">后台润色中</p>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[#666]">
                      {processingText || "任务已提交，页面会自动刷新结果。"}
                    </p>
                  </div>
                ) : taskFailed ? (
                  <div className="editor-status">
                    <p className="text-lg font-black text-[#111]">任务处理失败</p>
                    <p className="mt-3 text-sm leading-7 text-[#666]">
                      {result?.error || "本次没有生成结果，如已扣点系统会自动退回。"}
                    </p>
                  </div>
                ) : (
                  <>
                    {diffSkipped && (
                      <p className="diff-tip">
                        文本较长，已自动关闭逐词高亮预览；左右文本框仍可编辑、复制和下载。
                      </p>
                    )}
                    {showResultDiff ? (
                      <DiffMainView
                        title="结果对比"
                        hint="绿色标记为润色后新增或替换出来的表达"
                        parts={rightDiffParts || []}
                        side="result"
                        onEdit={() => setEditingPane("result")}
                      />
                    ) : (
                      <textarea
                        autoFocus={editingPane === "result"}
                        className="pane-textarea"
                        value={resultText}
                        onChange={(event) => setResultText(event.target.value)}
                        onFocus={() => setEditingPane("result")}
                        placeholder="改写结果将在此显示，也可以在生成后继续手动编辑..."
                        aria-label="改写结果"
                      />
                    )}
                  </>
                )}
              </div>
              <div className="grid gap-2 border-t border-[#f1f1f1] bg-[#fbfbfb] px-5 py-3 text-sm text-[#777] md:grid-cols-4">
                {taskDone && result?.taskId ? (
                  <>
                    <span>{currentDownloadText ? "右侧内容可下载" : "24小时内可下载"}</span>
                    <button
                      className="flex items-center gap-1 font-bold text-[#111] disabled:text-[#aaa]"
                      disabled={!currentDownloadText}
                      onClick={() => downloadEditedText("txt")}
                      type="button"
                    >
                      <Download size={14} />
                      TXT
                    </button>
                    <button
                      className="flex items-center gap-1 font-bold text-[#111] disabled:text-[#aaa]"
                      disabled={!currentDownloadText}
                      onClick={() => downloadEditedText("docx")}
                      type="button"
                    >
                      <Download size={14} />
                      DOC
                    </button>
                    <span>{result.usedFree ? "免费额度" : `扣 ${result.costPoints} 点`}</span>
                  </>
                ) : (
                  <span className="md:col-span-4">示例为自生成文本，按平实降 AIGC 指令润色。正式结果保留24小时。</span>
                )}
              </div>
            </div>
          </div>
          {message && <p className="mt-5 rounded-2xl bg-red-50 px-5 py-3 text-sm text-red-700">{message}</p>}
        </div>
      </section>

      <section className="bg-[#fafafa] px-4 py-20">
        <div className="shell">
          <h2 className="section-title mb-9 text-center">为什么选择我们</h2>
          <div className="grid gap-5 md:grid-cols-4">
            {features.map(({ no, title, body, Icon }) => (
              <div key={title} className="rounded-3xl border border-[#f0f0f0] bg-white p-7">
                <div className="mb-7 flex items-center justify-between">
                  <span className="text-4xl font-black text-[#eeeeee]">{no}</span>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f7f7f7]">
                    <Icon className="text-[#111]" size={22} />
                  </span>
                </div>
                <h3 className="mb-3 text-xl font-bold">{title}</h3>
                <p className="text-sm leading-7 text-[#777]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="bg-[#fafafa] px-4 py-20">
        <div className="shell max-w-5xl">
          <h2 className="section-title mb-8 text-center">常见问题</h2>
          <div className="faq-list">
            {faqs.map(([question, answer], index) => (
              <div key={question} className="faq-item">
                <button className="faq-question" onClick={() => setOpenFaq(openFaq === index ? -1 : index)} type="button">
                  <span>{question}</span>
                  <span className={openFaq === index ? "faq-icon faq-icon-open" : "faq-icon"}>
                    <Plus size={26} />
                  </span>
                </button>
                <div className={openFaq === index ? "faq-answer-wrap faq-answer-wrap-open" : "faq-answer-wrap"}>
                  <p className="faq-answer">{answer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-[#f1f1f1] bg-white px-4 py-12">
        <div className="shell grid gap-8 text-sm text-[#777] md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div>
            <div className="mb-3 flex items-center gap-2 font-bold text-[#111]">
              <Image className="brand-logo brand-logo-footer" src="/brand-logo.png" alt="论文降AIGC" width={176} height={60} />
            </div>
            <p className="leading-7">基于大语言模型的文本自然化润色工具，帮助降低文本机器感。</p>
          </div>
          <div>
            <h4 className="mb-3 font-bold text-[#111]">产品</h4>
            <a href="#editor" className="block py-1">在线 AIGC 润色</a>
            <Link href="/login" className="block py-1">卡密登录</Link>
          </div>
          <div>
            <h4 className="mb-3 font-bold text-[#111]">服务</h4>
            <button className="block py-1 text-left" onClick={() => setDialog("feedback")} type="button">意见反馈</button>
            <button className="block py-1 text-left" onClick={() => setDialog("contact")} type="button">联系方式</button>
          </div>
          <div>
            <h4 className="mb-3 font-bold text-[#111]">合规</h4>
            <button className="block py-1 text-left" onClick={() => setDialog("privacy")} type="button">隐私政策</button>
            <button className="block py-1 text-left" onClick={() => setDialog("terms")} type="button">用户协议</button>
          </div>
        </div>
        <div className="shell sponsor-footer">
          <a className="sponsor-link" href="https://www.xiaojiyun.com/" target="_blank" rel="noopener noreferrer">
            <span>由小鸡云赞助</span>
            <Image className="sponsor-logo" src="/xiaojiyun-logo.png" alt="小鸡云" width={142} height={42} />
          </a>
        </div>
      </footer>

      {dialog && (
        <div className="modal-backdrop" onClick={() => setDialog(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setDialog(null)} type="button">
              <X size={22} />
            </button>
            {dialog === "privacy" && (
              <ModalText
                title="隐私政策"
                items={[
                  ["1. 数据收集与使用", "我们仅收集您主动提交的文本、文档和卡密使用信息，用于完成润色、扣点和结果查询。"],
                  ["2. 数据存储与删除", "润色记录和相关文档只保留24小时，超过时间后系统会自动删除，不再提供查询和下载。"],
                  ["3. 第三方服务", "处理文本时会调用大语言模型接口，但不会主动提交您的联系方式和支付信息。"],
                  ["4. 安全保障", "系统使用服务端扣点和会话校验，避免卡密被重复滥用。"],
                ]}
              />
            )}
            {dialog === "terms" && (
              <ModalText
                title="用户协议"
                items={[
                  ["1. 服务内容", "本工具提供文本润色和降低机器感服务，结果仅供表达优化参考。"],
                  ["2. 用户义务", "用户应自行确认文本用途合规，不得用于违法、侵权或违反学校规定的场景。"],
                  ["3. 免责声明", "不同检测平台规则不同，平台不承诺任何检测结果一定通过。"],
                  ["4. 记录期限", "润色结果仅保留24小时，请及时下载。过期删除后无法恢复。"],
                ]}
              />
            )}
            {(dialog === "feedback" || dialog === "contact") && (
              <div>
                <h3 className="text-2xl font-black">{dialog === "feedback" ? "意见反馈" : "联系方式"}</h3>
                <p className="mt-1 text-[#999]">您的建议是我们进步的动力</p>
                <label className="mt-8 block text-sm font-bold">反馈内容 <span className="text-red-500">*</span></label>
                <textarea
                  className="field mt-3 min-h-36 w-full p-4"
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="请详细描述您遇到的问题或建议，我们会认真查看..."
                />
                <label className="mt-6 block text-sm font-bold">联系方式</label>
                <input
                  className="field mt-3 w-full px-4 py-3"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  placeholder="微信 / 邮箱（选填）"
                />
                <div className="mt-8 flex justify-end gap-4">
                  <button className="button-secondary px-7 py-3 font-bold" onClick={() => setDialog(null)} type="button">
                    取消
                  </button>
                  <button
                    className="button-primary px-8 py-3"
                    onClick={() => {
                      setFeedback("");
                      setContact("");
                      setDialog(null);
                    }}
                    type="button"
                  >
                    提交反馈
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function ModalText({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <div>
      <h3 className="text-2xl font-black">{title}</h3>
      <div className="mt-8 space-y-7">
        {items.map(([heading, body]) => (
          <div key={heading}>
            <h4 className="font-bold">{heading}</h4>
            <p className="mt-3 leading-8 text-[#555]">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
