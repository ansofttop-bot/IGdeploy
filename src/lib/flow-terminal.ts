import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import type { TerminalExecutionResult } from "../types/flow";
import {
  extractDocumentTextFromBytes,
  isRichDocumentExtension,
  looksCorruptedBinaryString,
} from "./word-parser";

const execAsync = promisify(exec);

const SANDBOX_ROOT = path.resolve("/tmp/igseek_sandbox/workspace");

const FORBIDDEN_PATTERNS = [
  /\brm\s+-rf\s+\/($|\s)/i,
  /\brm\s+-rf\s+~($|\s)/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /:(){ :\|:& };:/,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bchmod\s+-R\s+777\s+\//i,
];

const ARCH_ASCII_LOGO = `
                   -\`                    arch@archlinux
                  .o+\`                   --------------
                 \`ooo/                   OS: Arch Linux x86_64
                \`+oooo:                  Host: IG Flow Sandbox Container
               \`+oooooo:                 Kernel: 6.9.3-arch1-1
               -+oooooo+:                Uptime: 1 hour, 34 mins
             \`/:-\`:++oooo+:               Packages: 842 (pacman)
            \`/++++/+++++++:              Shell: bash 5.2.26
           \`/++++++++++++++:             Terminal: igflow-pty
          \`/+++ooooooooooooo/\`           CPU: AMD EPYC (Containerized)
         ./ooosssso++osssssso+\`          Memory: 1142MiB / 8192MiB
        .oossssso-\`\`\`\`/ossssss+\`         Disk: 5.2G / 50G (/library mounted)
       -osssssso.      :ssssssso.        Locale: ru_RU.UTF-8 / en_US.UTF-8
      :osssssss/        osssso+++.       WM: IG Flow PTY
     /ossssssss/        +ssssooo/-       
   \`/ossssso+/:-        -:/+osssso+-     
  \`+sso+:-\`                 \`.-/+oso:    
 \`++:.                           \`-/+/   
 .\`                                 \`/   
`;

function sanitizeProjectId(projectId?: string | null): string | null {
  if (!projectId) return null;
  const clean = projectId.replace(/[^a-zA-Z0-9._-]/g, "_").trim();
  return clean || null;
}

export function isWithinDirectory(candidatePath: string, baseDir: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedCandidate = path.resolve(candidatePath);
  if (resolvedCandidate === resolvedBase) return true;
  const prefix = resolvedBase.endsWith(path.sep) ? resolvedBase : `${resolvedBase}${path.sep}`;
  return resolvedCandidate.startsWith(prefix);
}

const SANDBOX_ENV_SECRET_RE =
  /(KEY|SECRET|TOKEN|PASSWORD|PASS|CREDENTIAL|AUTH|DATABASE|POSTGRES|PG_|PLATEGA|FIREBASE|DEEPSEEK|APIMIRA|GROQ|GEMINI|OPENAI|MISTRAL|GITHUB|S3_|AWS_|VERCEL)/i;

export function buildSanitizedSandboxEnv(
  sourceEnv: Record<string, string | undefined>,
  workspaceDir: string,
  libraryDir: string,
  extraEnv?: Record<string, string>,
): Record<string, string> {
  const clean: Record<string, string> = {};
  const allowlist = new Set(["PATH", "LANG", "LC_ALL", "TERM", "TZ", "NODE_ENV"]);
  for (const [k, v] of Object.entries(sourceEnv)) {
    if (typeof v !== "string") continue;
    if (allowlist.has(k) && !SANDBOX_ENV_SECRET_RE.test(k)) {
      clean[k] = v;
    }
  }
  if (!clean.PATH) {
    clean.PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
  }
  clean.PAGER = "cat";
  clean.CI = "true";
  clean.USER = "arch";
  clean.HOME = workspaceDir;
  clean.FLOW_LIBRARY_DIR = libraryDir;
  if (extraEnv) {
    for (const [k, v] of Object.entries(extraEnv)) {
      if (!SANDBOX_ENV_SECRET_RE.test(k)) {
        clean[k] = v;
      }
    }
  }
  return clean;
}

export function sanitizeLibraryFilename(filename: string): string {
  const base = path.basename(filename).trim();
  const safe = base.replace(/[^a-zA-Z0-9._\-а-яА-ЯёЁ\s]/g, "_").replace(/\s+/g, "_");
  return safe || `flow_file_${Date.now()}.txt`;
}

function detectFileType(filename: string): "document" | "code" | "data" | "image" {
  const ext = path.extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) return "image";
  if ([".ts", ".tsx", ".js", ".jsx", ".py", ".sh", ".css", ".html", ".sql", ".go", ".rs", ".d", ".di", ".c", ".cpp", ".h", ".java"].includes(ext)) return "code";
  if ([".json", ".csv", ".tsv", ".yaml", ".yml", ".xml", ".ics"].includes(ext)) return "data";
  return "document";
}

function isLikelyTextFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const binaryExts = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".pdf",
    ".zip",
    ".gz",
    ".tar",
    ".jar",
    ".apk",
    ".bin",
    ".exe",
    ".dll",
    ".so",
    ".wasm",
    ".mp4",
    ".mp3",
    ".doc",
    ".docx",
    ".docm",
    ".dotx",
    ".dotm",
    ".odt",
    ".ott",
    ".ods",
    ".ots",
    ".odp",
    ".otp",
    ".rtf",
    ".xls",
    ".xlsx",
    ".xlsm",
    ".xlsb",
    ".xltx",
    ".xltm",
    ".ppt",
    ".pptx",
    ".pptm",
    ".ppsx",
    ".ppsm",
    ".potx",
    ".potm",
    ".fb2",
    ".epub",
  ];
  return !binaryExts.includes(ext);
}

function sanitizeUserScope(userScope?: string | null): string | null {
  if (!userScope) return null;
  const clean = userScope.replace(/[^a-zA-Z0-9._-]/g, "_").trim();
  return clean && clean !== "_" && clean !== "." && clean !== ".." ? clean : null;
}

export function getSandboxPaths(
  projectId?: string | null,
  userScope?: string | null,
): { workspaceDir: string; libraryDir: string } {
  const safeScope = sanitizeUserScope(userScope) || `ephemeral_${Date.now()}`;
  const scopeRoot = path.join(SANDBOX_ROOT, "scopes", safeScope);
  const safeProj = sanitizeProjectId(projectId);
  if (safeProj) {
    const workspaceDir = path.join(scopeRoot, "projects", safeProj);
    const libraryDir = path.join(workspaceDir, "library");
    return { workspaceDir, libraryDir };
  }
  return {
    workspaceDir: scopeRoot,
    libraryDir: path.join(scopeRoot, "library"),
  };
}

export async function initLibraryDirectory(
  projectId?: string | null,
  userScope?: string | null,
): Promise<string> {
  const { workspaceDir, libraryDir } = getSandboxPaths(projectId, userScope);
  try {
    await fs.mkdir(SANDBOX_ROOT, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(libraryDir, { recursive: true });
  } catch (e) {
    console.warn("Failed to init library directory:", e);
  }
  return libraryDir;
}

export interface DiskLibraryEntry {
  name: string;
  type: "document" | "code" | "data" | "image";
  sizeBytes: number;
  updatedAt: string;
  isText: boolean;
  content?: string;
  projectId: string | null;
}

export async function listLibraryFilesOnDisk(
  projectId?: string | null,
  includeContent = false,
  userScope?: string | null,
): Promise<DiskLibraryEntry[]> {
  if (!sanitizeUserScope(userScope)) {
    return [];
  }
  const libDir = await initLibraryDirectory(projectId, userScope);
  const cleanProj = sanitizeProjectId(projectId);
  try {
    const entries = await fs.readdir(libDir, { withFileTypes: true });
    const results: DiskLibraryEntry[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(libDir, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        const likelyText = isLikelyTextFile(entry.name);
        const isRichDoc = isRichDocumentExtension(entry.name);
        let isText = likelyText;
        let content: string | undefined;
        if (includeContent && likelyText && stat.size <= 512 * 1024) {
          const rawUtf8 = await fs.readFile(fullPath, "utf8");
          if (looksCorruptedBinaryString(rawUtf8)) {
            isText = false;
          } else {
            content = rawUtf8;
          }
        } else if (includeContent && isRichDoc && stat.size <= 4 * 1024 * 1024) {
          try {
            const buf = await fs.readFile(fullPath);
            const extracted = await extractDocumentTextFromBytes(new Uint8Array(buf), entry.name);
            if (extracted && !looksCorruptedBinaryString(extracted)) {
              content = extracted.slice(0, 500_000);
              isText = true;
            }
          } catch {
          }
        }
        results.push({
          name: entry.name,
          type: detectFileType(entry.name),
          sizeBytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
          isText,
          content,
          projectId: cleanProj,
        });
      } catch {
      }
    }
    results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return results;
  } catch {
    return [];
  }
}

export async function readLibraryFileOnDisk(
  filename: string,
  projectId?: string | null,
  userScope?: string | null,
): Promise<{ name: string; content: string; sizeBytes: number; updatedAt: string } | null> {
  if (!sanitizeUserScope(userScope)) return null;
  const libDir = await initLibraryDirectory(projectId, userScope);
  const targetExact = path.resolve(libDir, path.basename(filename));
  const candidates = [targetExact, path.resolve(libDir, sanitizeLibraryFilename(filename))];

  for (const candidate of candidates) {
    if (!isWithinDirectory(candidate, libDir)) continue;
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) continue;
      const base = path.basename(candidate);
      let content = `[Binary file, ${stat.size} bytes]`;
      if (isLikelyTextFile(base)) {
        const rawUtf8 = await fs.readFile(candidate, "utf8");
        content = looksCorruptedBinaryString(rawUtf8) ? `[Binary file, ${stat.size} bytes]` : rawUtf8;
      } else if (isRichDocumentExtension(base) && stat.size <= 8 * 1024 * 1024) {
        const buf = await fs.readFile(candidate);
        const extracted = await extractDocumentTextFromBytes(new Uint8Array(buf), base);
        if (extracted) {
          content = extracted;
        }
      }
      return {
        name: base,
        content,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    } catch {
    }
  }
  return null;
}

export async function writeLibraryFileOnDisk(
  filename: string,
  content: string,
  projectId?: string | null,
  userScope?: string | null,
): Promise<{ name: string; path: string; sizeBytes: number; content: string }> {
  const libDir = await initLibraryDirectory(projectId, userScope);
  const safeName = sanitizeLibraryFilename(filename);
  const targetPath = path.join(libDir, safeName);

  await fs.writeFile(targetPath, content, "utf8");
  const verifiedContent = await fs.readFile(targetPath, "utf8");
  const stat = await fs.stat(targetPath);

  return {
    name: safeName,
    path: targetPath,
    sizeBytes: stat.size,
    content: verifiedContent,
  };
}

export async function deleteLibraryFileOnDisk(
  filename: string,
  projectId?: string | null,
  userScope?: string | null,
): Promise<boolean> {
  if (!sanitizeUserScope(userScope)) return false;
  const libDir = await initLibraryDirectory(projectId, userScope);
  const candidates = [
    path.resolve(libDir, path.basename(filename)),
    path.resolve(libDir, sanitizeLibraryFilename(filename)),
  ];
  for (const candidate of candidates) {
    if (!isWithinDirectory(candidate, libDir)) continue;
    try {
      await fs.unlink(candidate);
      return true;
    } catch {
    }
  }
  return false;
}

export async function renameLibraryFileOnDisk(
  oldName: string,
  newName: string,
  projectId?: string | null,
  userScope?: string | null,
): Promise<boolean> {
  if (!sanitizeUserScope(userScope)) return false;
  const libDir = await initLibraryDirectory(projectId, userScope);
  const safeNew = sanitizeLibraryFilename(newName);
  const newPath = path.resolve(libDir, safeNew);
  if (!isWithinDirectory(newPath, libDir)) return false;

  const candidates = [
    path.resolve(libDir, path.basename(oldName)),
    path.resolve(libDir, sanitizeLibraryFilename(oldName)),
  ];
  for (const oldPath of candidates) {
    if (!isWithinDirectory(oldPath, libDir)) continue;
    try {
      await fs.access(oldPath);
      await fs.rename(oldPath, newPath);
      return true;
    } catch {
    }
  }
  return false;
}

export async function syncLibraryFilesToDisk(
  files: Array<{ name: string; dataUrl?: string; content?: string }>,
  projectId?: string | null,
  userScope?: string | null,
): Promise<number> {
  if (!sanitizeUserScope(userScope)) return 0;
  const libDir = await initLibraryDirectory(projectId, userScope);
  let count = 0;

  for (const file of files) {
    if (!file || !file.name) continue;
    const safeName = sanitizeLibraryFilename(file.name);
    if (!safeName) continue;
    const targetPath = path.join(libDir, safeName);

    try {
      const preferBinaryDataUrl = Boolean(file.dataUrl && isRichDocumentExtension(file.name));
      if (file.content !== undefined && !preferBinaryDataUrl && !looksCorruptedBinaryString(file.content)) {
        await fs.writeFile(targetPath, file.content, "utf8");
        count++;
      } else if (file.dataUrl) {
        if (file.dataUrl.startsWith("data:text/") || file.dataUrl.startsWith("data:application/json")) {
          const base64Index = file.dataUrl.indexOf(";base64,");
          if (base64Index !== -1) {
            const buf = Buffer.from(file.dataUrl.slice(base64Index + 8), "base64");
            await fs.writeFile(targetPath, buf);
          } else {
            const commaIndex = file.dataUrl.indexOf(",");
            const text = decodeURIComponent(file.dataUrl.slice(commaIndex + 1));
            await fs.writeFile(targetPath, text, "utf8");
          }
          count++;
        } else if (file.dataUrl.includes(";base64,")) {
          const parts = file.dataUrl.split(";base64,");
          if (parts[1]) {
            const buf = Buffer.from(parts[1], "base64");
            await fs.writeFile(targetPath, buf);
            count++;
          }
        }
      } else if (file.content !== undefined && !looksCorruptedBinaryString(file.content)) {
        await fs.writeFile(targetPath, file.content, "utf8");
        count++;
      }
    } catch (e) {
      console.warn(`Failed to sync file ${file.name}:`, e);
    }
  }
  return count;
}

async function snapshotLibMtimes(libDir: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const entries = await fs.readdir(libDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      try {
        const st = await fs.stat(path.join(libDir, e.name));
        map.set(e.name, st.mtimeMs);
      } catch {  }
    }
  } catch {  }
  return map;
}

export async function executeTerminalCommand(
  rawCommand: string,
  options: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; projectId?: string | null; userScope?: string | null } = {}
): Promise<TerminalExecutionResult> {
  const start = Date.now();
  const command = rawCommand.trim();

  const { workspaceDir, libraryDir } = getSandboxPaths(options.projectId, options.userScope);
  await initLibraryDirectory(options.projectId, options.userScope);

  const platformEscape = /\/app\b|\/proc\b|\/sys\b|\/etc\/shadow|\.\.\/\.\./i.test(command);
  if (platformEscape) {
    return {
      command,
      exitCode: 126,
      stdout: "",
      stderr: "Access restricted by Sandbox security policy: Flow agent is isolated in the user workspace and cannot access platform source code.",
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(command)) {
      return {
        command,
        exitCode: 126,
        stdout: "",
        stderr: `Security policy violation: command matched forbidden pattern [${pattern.toString()}]. Execution blocked.`,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }
  }

  let currentRunDir = workspaceDir;
  if (options.cwd) {
    const candidate = path.resolve(workspaceDir, options.cwd);
    if (isWithinDirectory(candidate, workspaceDir)) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isDirectory()) {
          currentRunDir = candidate;
        }
      } catch {
        currentRunDir = workspaceDir;
      }
    }
  }

  const lower = command.toLowerCase();

  if (lower === "neofetch" || lower === "fastfetch") {
    return {
      command,
      exitCode: 0,
      stdout: ARCH_ASCII_LOGO,
      stderr: "",
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  if (lower === "uname -a" || lower === "uname -srm" || lower === "uname -r") {
    const out =
      lower === "uname -r"
        ? "6.9.3-arch1-1"
        : lower === "uname -srm"
        ? "Linux 6.9.3-arch1-1 x86_64"
        : "Linux archlinux 6.9.3-arch1-1 #1 SMP PREEMPT_DYNAMIC Sun, 02 Jun 2024 14:02:18 +0000 x86_64 GNU/Linux";
    return {
      command,
      exitCode: 0,
      stdout: out,
      stderr: "",
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  if (lower.includes("os-release") || lower.includes("arch-release") || lower.includes("cat /etc/issue")) {
    return {
      command,
      exitCode: 0,
      stdout: `NAME="Arch Linux"
PRETTY_NAME="Arch Linux"
ID=arch
BUILD_ID=rolling
ANSI_COLOR="38;2;23;147;209"
HOME_URL="https://archlinux.org/"`,
      stderr: "",
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  if (lower.startsWith("pacman")) {
    if (lower === "pacman" || lower === "pacman -h" || lower === "pacman --help") {
      return {
        command,
        exitCode: 0,
        stdout: `usage:  pacman <operation> [...]`,
        stderr: "",
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }
    if (lower.startsWith("pacman -q")) {
      return {
        command,
        exitCode: 0,
        stdout: `bash 5.2.026-2\ncoreutils 9.5-1\ncurl 8.8.0-1\ngit 2.45.2-1\nnodejs 22.14.0-1\npython 3.12.3-1`,
        stderr: "",
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }
  }

  const cdMatch = command.match(/^cd(?:\s+(.*))?$/);
  if (cdMatch) {
    const rawDest = (cdMatch[1] || "").trim();
    let destDir = workspaceDir;
    if (rawDest && rawDest !== "~") {
      destDir = path.resolve(currentRunDir, rawDest);
    }
    if (!isWithinDirectory(destDir, workspaceDir)) {
      destDir = workspaceDir;
    }

    try {
      const stat = await fs.stat(destDir);
      if (!stat.isDirectory()) {
        return {
          command,
          exitCode: 1,
          stdout: "",
          stderr: `bash: cd: ${rawDest}: Not a directory`,
          executedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
        };
      }
      const rel = path.relative(workspaceDir, destDir);
      return {
        command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        newCwd: rel ? rel : "~",
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    } catch {
      return {
        command,
        exitCode: 1,
        stdout: "",
        stderr: `bash: cd: ${rawDest}: No such file or directory`,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }
  }

  const beforeSnap = await snapshotLibMtimes(libraryDir);

  const timeout = Math.min(options.timeoutMs || 12000, 20000);
  const wrappedCommand = `( ${command} ) < /dev/null\necho "__FLOW_PWD__"$(pwd)`;

  try {
    const { stdout, stderr } = await execAsync(wrappedCommand, {
      cwd: currentRunDir,
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 5 * 1024 * 1024,
      env: buildSanitizedSandboxEnv(process.env, workspaceDir, libraryDir, options.env),
      shell: "/bin/bash",
    });

    let cleanStdout = stdout || "";
    let detectedNewCwd: string | undefined = undefined;

    const pwdMarkerIndex = cleanStdout.indexOf("__FLOW_PWD__");
    if (pwdMarkerIndex !== -1) {
      const pwdLine = cleanStdout.slice(pwdMarkerIndex + 12).trim();
      cleanStdout = cleanStdout.slice(0, pwdMarkerIndex);
      if (isWithinDirectory(pwdLine, workspaceDir)) {
        const rel = path.relative(workspaceDir, pwdLine);
        detectedNewCwd = rel ? rel : "~";
      }
    }

    if (cleanStdout.endsWith("\n")) {
      cleanStdout = cleanStdout.slice(0, -1);
    }

    const afterSnap = await snapshotLibMtimes(libraryDir);
    const createdFiles: Array<{ name: string; type: string; content: string; projectId?: string | null }> = [];
    const cleanProj = sanitizeProjectId(options.projectId);

    for (const [fname, mtime] of afterSnap.entries()) {
      const prevMtime = beforeSnap.get(fname);
      if (prevMtime === undefined || mtime > prevMtime) {
        if (!isLikelyTextFile(fname)) continue;
        try {
          const full = path.join(libraryDir, fname);
          const st = await fs.stat(full);
          if (st.size <= 512 * 1024) {
            const content = await fs.readFile(full, "utf8");
            createdFiles.push({
              name: fname,
              type: detectFileType(fname),
              content,
              projectId: cleanProj,
            });
          }
        } catch {  }
      }
    }

    return {
      command,
      exitCode: 0,
      stdout: cleanStdout,
      stderr: stderr ? stderr.trim() : "",
      newCwd: detectedNewCwd,
      createdFiles: createdFiles.length > 0 ? createdFiles : undefined,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    const exitCode = typeof error.code === "number" ? error.code : 1;
    let stdout = error.stdout ? String(error.stdout) : "";
    const stderr = error.stderr ? String(error.stderr).trim() : error.message || "Command failed";

    const pwdMarkerIndex = stdout.indexOf("__FLOW_PWD__");
    if (pwdMarkerIndex !== -1) {
      stdout = stdout.slice(0, pwdMarkerIndex);
    }

    return {
      command,
      exitCode,
      stdout: stdout.trim(),
      stderr,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }
}
