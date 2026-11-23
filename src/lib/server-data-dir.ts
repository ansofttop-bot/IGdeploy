import os from "node:os";
import path from "node:path";

/**
 * Returns a writable directory for ephemeral server-side fallback caches.
 * On serverless runtimes (Vercel, AWS Lambda) process.cwd() is read-only,
 * so we write into os.tmpdir() instead.
 */
export function getWritableDataDir(): string {
  const customDir = (process.env.DATA_DIR || "").trim();
  if (customDir) {
    return path.resolve(customDir);
  }
  if (process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)) {
    return path.join(os.tmpdir(), "igseek-data");
  }
  return path.resolve(process.cwd(), ".data");
}
