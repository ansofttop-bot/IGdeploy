const EXT_MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".docm": "application/vnd.ms-word.document.macroEnabled.12",
  ".dotx": "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  ".dotm": "application/vnd.ms-word.template.macroEnabled.12",
  ".doc": "application/msword",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".rtf": "application/rtf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsb": "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
  ".xls": "application/vnd.ms-excel",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  ".xltx": "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".pptm": "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
  ".ppsx": "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  ".potx": "application/vnd.openxmlformats-officedocument.presentationml.template",
  ".ppt": "application/vnd.ms-powerpoint",
  ".fb2": "application/x-fictionbook+xml",
  ".epub": "application/epub+zip",
  ".d": "text/x-dsrc",
  ".di": "text/x-dsrc",
  ".json": "application/json",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".py": "text/x-python",
  ".sql": "application/sql",
  ".xml": "application/xml",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".txt": "text/plain",
  ".log": "text/plain",
};

export function guessMimeTypeFromName(name: string, fallback = "text/plain"): string {
  const lower = (name || "").toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot !== -1) {
    const ext = lower.slice(dot);
    if (EXT_MIME_MAP[ext]) return EXT_MIME_MAP[ext];
  }
  return fallback;
}

export function compressBrowserImageDataUrl(
  rawUrl: string,
  maxSide = 1400,
  targetMaxChars = 680_000,
): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(rawUrl);
  }
  if (!rawUrl.startsWith("data:image/") || rawUrl.length <= targetMaxChars) {
    return Promise.resolve(rawUrl);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        const qualities = [0.82, 0.72, 0.6, 0.48];
        for (let pass = 0; pass < 3; pass++) {
          const w = Math.max(1, Math.round((img.width || 1) * scale));
          const h = Math.max(1, Math.round((img.height || 1) * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(rawUrl);
          ctx.drawImage(img, 0, 0, w, h);
          for (const q of qualities) {
            const candidate = canvas.toDataURL("image/jpeg", q);
            if (candidate.length <= targetMaxChars) {
              return resolve(candidate);
            }
          }
          scale *= 0.72;
        }
        const finalW = Math.max(1, Math.round((img.width || 1) * scale));
        const finalH = Math.max(1, Math.round((img.height || 1) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = finalW;
        canvas.height = finalH;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(rawUrl);
        ctx.drawImage(img, 0, 0, finalW, finalH);
        resolve(canvas.toDataURL("image/jpeg", 0.45));
      } catch {
        resolve(rawUrl);
      }
    };
    img.onerror = () => resolve(rawUrl);
    img.src = rawUrl;
  });
}
