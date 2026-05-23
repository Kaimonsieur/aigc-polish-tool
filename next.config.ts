import type { NextConfig } from "next";

const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(staticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
        assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || undefined,
        images: {
          unoptimized: true,
        },
      }
    : {}),
  serverExternalPackages: ["pdf-parse", "mammoth", "docx"],
};

export default nextConfig;
