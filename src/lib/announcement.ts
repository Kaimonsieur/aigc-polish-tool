import { getSetting, setSetting } from "@/lib/settings";

export const ANNOUNCEMENT_KEY = "site_announcement";

export type AnnouncementConfig = {
  enabled: boolean;
  title: string;
  content: string;
  buttonText: string;
  buttonUrl: string;
  version: string;
  updatedAt: string;
};

export const DEFAULT_ANNOUNCEMENT: AnnouncementConfig = {
  enabled: false,
  title: "网站公告",
  content: "",
  buttonText: "我知道了",
  buttonUrl: "",
  version: "default",
  updatedAt: "",
};

function readAnnouncementJson() {
  const raw = getSetting(ANNOUNCEMENT_KEY, "");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Partial<AnnouncementConfig>;
  } catch {
    return null;
  }
}

export function getAnnouncementConfig(): AnnouncementConfig {
  const stored = readAnnouncementJson();
  return {
    ...DEFAULT_ANNOUNCEMENT,
    ...stored,
    enabled: Boolean(stored?.enabled),
    title: String(stored?.title || DEFAULT_ANNOUNCEMENT.title),
    content: String(stored?.content || ""),
    buttonText: String(stored?.buttonText || DEFAULT_ANNOUNCEMENT.buttonText),
    buttonUrl: String(stored?.buttonUrl || ""),
    version: String(stored?.version || DEFAULT_ANNOUNCEMENT.version),
    updatedAt: String(stored?.updatedAt || ""),
  };
}

export function getPublicAnnouncement() {
  const announcement = getAnnouncementConfig();
  if (!announcement.enabled || !announcement.title.trim() || !announcement.content.trim()) {
    return null;
  }
  return announcement;
}

export function saveAnnouncementConfig(input: Partial<AnnouncementConfig>) {
  const announcement: AnnouncementConfig = {
    enabled: Boolean(input.enabled),
    title: String(input.title || "").trim(),
    content: String(input.content || "").trim(),
    buttonText: String(input.buttonText || DEFAULT_ANNOUNCEMENT.buttonText).trim(),
    buttonUrl: String(input.buttonUrl || "").trim(),
    version: `notice-${Date.now()}`,
    updatedAt: new Date().toISOString(),
  };

  if (!announcement.buttonText) {
    announcement.buttonText = DEFAULT_ANNOUNCEMENT.buttonText;
  }

  setSetting(ANNOUNCEMENT_KEY, JSON.stringify(announcement));
  return announcement;
}
