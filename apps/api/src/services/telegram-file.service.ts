import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config";

interface CachedFile {
  buffer: Buffer;
  contentType: string;
  cachedAt: number;
}

const fileCache = new Map<string, CachedFile>();
const MAX_CACHE_ITEMS = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DISK_CACHE_DIR = process.env.SLIP_DISK_CACHE_DIR || path.resolve(process.cwd(), ".cache/slips");

function getDiskCachePaths(fileId: string) {
  const hash = crypto.createHash("sha256").update(fileId).digest("hex");
  return {
    binPath: path.join(DISK_CACHE_DIR, `${hash}.bin`),
    metaPath: path.join(DISK_CACHE_DIR, `${hash}.json`),
  };
}

function ensureDiskCacheDir() {
  try {
    if (!fs.existsSync(DISK_CACHE_DIR)) {
      fs.mkdirSync(DISK_CACHE_DIR, { recursive: true });
    }
  } catch (err: any) {
    console.warn("[TelegramFileProxy] Could not create disk cache directory:", err?.message || err);
  }
}

/**
 * Downloads and caches a Telegram photo/file by file_id without exposing bot credentials to the browser.
 */
export async function fetchTelegramFile(fileId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!fileId || typeof fileId !== "string" || fileId.trim().length === 0) {
    return null;
  }

  const cleanId = fileId.trim();

  // 1. Check in-memory LRU cache
  const cached = fileCache.get(cleanId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { buffer: cached.buffer, contentType: cached.contentType };
  }

  // 2. Check persistent disk cache
  const { binPath, metaPath } = getDiskCachePaths(cleanId);
  try {
    if (fs.existsSync(binPath) && fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      const buffer = fs.readFileSync(binPath);
      fileCache.set(cleanId, { buffer, contentType: meta.contentType, cachedAt: Date.now() });
      return { buffer, contentType: meta.contentType };
    }
  } catch {
    // Disk read failed, fallback to network
  }

  const token = config.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[TelegramFileProxy] TELEGRAM_BOT_TOKEN is not configured.");
    return null;
  }

  try {
    // 2. Request file info from Telegram
    const infoUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(cleanId)}`;
    const infoRes = await fetch(infoUrl, { signal: AbortSignal.timeout(10000) });
    const infoData: any = await infoRes.json().catch(() => ({}));

    if (!infoRes.ok || !infoData.ok || !infoData.result?.file_path) {
      console.warn(`[TelegramFileProxy] getFile failed for ${cleanId}:`, infoData?.description || "Unknown error");
      return null;
    }

    const filePath = infoData.result.file_path;

    // 3. Download the actual binary file from Telegram CDN
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const fileRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(15000) });

    if (!fileRes.ok) {
      console.warn(`[TelegramFileProxy] Download failed for ${filePath}: HTTP ${fileRes.status}`);
      return null;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let contentType = fileRes.headers.get("content-type") || "image/jpeg";
    if (contentType === "application/octet-stream" || !contentType.startsWith("image/")) {
      if (filePath.endsWith(".png")) {
        contentType = "image/png";
      } else if (filePath.endsWith(".webp")) {
        contentType = "image/webp";
      } else {
        contentType = "image/jpeg";
      }
    }

    // 4. Store in memory cache with size eviction
    if (fileCache.size >= MAX_CACHE_ITEMS) {
      const oldestKey = fileCache.keys().next().value;
      if (oldestKey) fileCache.delete(oldestKey);
    }
    fileCache.set(cleanId, { buffer, contentType, cachedAt: Date.now() });

    // 5. Asynchronously persist to disk cache
    try {
      ensureDiskCacheDir();
      fs.writeFileSync(binPath, buffer);
      fs.writeFileSync(metaPath, JSON.stringify({ contentType, cachedAt: Date.now() }));
    } catch (diskErr: any) {
      console.warn("[TelegramFileProxy] Could not persist to disk cache:", diskErr?.message || diskErr);
    }

    return { buffer, contentType };
  } catch (err: any) {
    console.error(`[TelegramFileProxy] Error fetching file ${cleanId}:`, err.message);
    return null;
  }
}

/**
 * Generates an SVG placeholder when a slip image is missing or cannot be retrieved from Telegram.
 */
export function getPlaceholderSlipSvg(message: string = "Slip Photo Not Available"): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#141f36"/>
    </linearGradient>
  </defs>
  <rect width="600" height="750" fill="url(#bg)"/>
  <rect x="36" y="36" width="528" height="678" rx="20" fill="#111c31" stroke="#233554" stroke-width="2"/>
  
  <!-- Icon Circle -->
  <circle cx="300" cy="260" r="54" fill="#1b2a47" stroke="#2d436d" stroke-width="2"/>
  <path d="M280 270 L296 244 L310 262 L320 250 L336 270 Z" fill="#4f6b99"/>
  <circle cx="286" cy="242" r="6" fill="#7ba0d6"/>
  <rect x="272" y="230" width="56" height="46" rx="6" fill="none" stroke="#60a5fa" stroke-width="3"/>

  <!-- Texts -->
  <text x="300" y="360" text-anchor="middle" fill="#e2e8f0" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="20" font-weight="700">Payment Slip Proof</text>
  <text x="300" y="395" text-anchor="middle" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="14">${message}</text>
  
  <!-- Badge -->
  <rect x="180" y="435" width="240" height="34" rx="8" fill="#172540" stroke="#2b3e63"/>
  <text x="300" y="457" text-anchor="middle" fill="#64748b" font-family="ui-monospace, monospace" font-size="12">Telegram Photo Proxy</text>
</svg>`;
  return Buffer.from(svg, "utf-8");
}
