// Server-side in-memory file cache for CV and Portfolio
// Files are cached during extraction and reused during email sending
// This avoids sending large base64 payloads in every send request

interface CachedFile {
  base64: string;
  mimeType: string;
  cachedAt: number;
}

interface UserFileCache {
  cv?: CachedFile;
  portfolio?: CachedFile;
}

// Cache keyed by user ID, auto-expires after 30 minutes
const FILE_CACHE = new Map<string, UserFileCache>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function cleanupExpired() {
  const now = Date.now();
  for (const [key, cache] of FILE_CACHE.entries()) {
    const cvExpired = cache.cv && now - cache.cv.cachedAt > CACHE_TTL;
    const portfolioExpired = cache.portfolio && now - cache.portfolio.cachedAt > CACHE_TTL;

    if (cvExpired) delete cache.cv;
    if (portfolioExpired) delete cache.portfolio;

    if (!cache.cv && !cache.portfolio) {
      FILE_CACHE.delete(key);
    }
  }
}

export function cacheFiles(
  userId: string,
  cvBase64?: string,
  portfolioBase64?: string
) {
  cleanupExpired();

  const existing = FILE_CACHE.get(userId) || {};

  if (cvBase64) {
    existing.cv = {
      base64: cvBase64,
      mimeType: "application/pdf",
      cachedAt: Date.now(),
    };
  }

  if (portfolioBase64) {
    existing.portfolio = {
      base64: portfolioBase64,
      mimeType: "application/pdf",
      cachedAt: Date.now(),
    };
  }

  FILE_CACHE.set(userId, existing);
}

export function getCachedFiles(userId: string): UserFileCache {
  cleanupExpired();
  return FILE_CACHE.get(userId) || {};
}

export function clearCache(userId: string) {
  FILE_CACHE.delete(userId);
}
