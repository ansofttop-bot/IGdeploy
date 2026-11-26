import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.get(['/api/health', '/healthz'], (_req, res) => {
  res.status(200).json({ ok: true, uptime: Math.round(process.uptime()) });
});

async function toWebRequest(req: express.Request): Promise<Request> {
  let bodyBuffer: Buffer;

  if (['GET', 'HEAD'].includes(req.method || '')) {
    bodyBuffer = Buffer.alloc(0);
  } else if ((req as any).rawBody) {
    bodyBuffer = Buffer.isBuffer((req as any).rawBody)
      ? (req as any).rawBody
      : Buffer.from((req as any).rawBody);
  } else if ((req as any).body && typeof (req as any).body === 'object' && Object.keys((req as any).body).length > 0) {
    bodyBuffer = Buffer.from(JSON.stringify((req as any).body));
  } else if (req.readableEnded || (req as any)._readableState?.ended) {
    bodyBuffer = Buffer.alloc(0);
  } else {
    bodyBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let resolved = false;

      let timer: ReturnType<typeof setTimeout> | null = null;
      const resetIdleTimer = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(finish, 15000);
      };

      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        resolve(Buffer.concat(chunks));
      };

      const onData = (chunk: any) => {
        resetIdleTimer();
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      };
      const onEnd = () => finish();
      const onError = (err: any) => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        reject(err);
      };

      resetIdleTimer();

      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);

      if (req.readableEnded) {
        finish();
      }
    });
  }

  const host = req.headers.host || `localhost:${port}`;
  const rawProto = req.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(rawProto) ? rawProto[0] : rawProto || 'http').split(',')[0].trim() || 'http';
  const fullUrl = new URL(req.url, `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val) headers.set(key, Array.isArray(val) ? val.join(',') : val);
  }

  return new Request(fullUrl.toString(), {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : (bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : undefined),
  });
}

async function pipeWebResponse(webRes: Response, res: express.Response) {
  res.status(webRes.status);
  webRes.headers.forEach((val, key) => {
    const lower = key.toLowerCase();
    if (lower === 'transfer-encoding' || lower === 'connection') return;
    res.setHeader(key, val);
  });

  const contentType = webRes.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('x-accel-buffering', 'no');
    res.socket?.setNoDelay?.(true);
    res.flushHeaders?.();
    if (webRes.body) {
      const reader = webRes.body.getReader();
      let clientClosed = false;
      const onClose = () => {
        clientClosed = true;
        void reader.cancel().catch(() => {});
      };
      res.on('close', onClose);
      try {
        while (!clientClosed) {
          const { done, value } = await reader.read();
          if (done || clientClosed) break;
          if (!res.writableEnded) {
            res.write(value);
          }
        }
      } catch {
      } finally {
        res.off('close', onClose);
        if (!res.writableEnded) res.end();
      }
    } else {
      if (!res.writableEnded) res.end();
    }
  } else {
    const arrayBuf = await webRes.arrayBuffer();
    if (!res.writableEnded) res.send(Buffer.from(arrayBuf));
  }
}

let viteDevServer: any = null;
const isBundledServer = path.extname(__filename) !== '.ts';
const disableHmr = process.env.DISABLE_HMR === 'true';
const cachedRouteModules = new Map<string, any>();

async function loadApiModule(vitePath: string, prodImporter: () => Promise<any>): Promise<any> {
  if (viteDevServer) {
    if (disableHmr && cachedRouteModules.has(vitePath)) {
      return cachedRouteModules.get(vitePath);
    }
    const mod = await viteDevServer.ssrLoadModule(vitePath);
    if (disableHmr) {
      cachedRouteModules.set(vitePath, mod);
    }
    return mod;
  }
  if (cachedRouteModules.has(vitePath)) {
    return cachedRouteModules.get(vitePath);
  }
  const mod = await prodImporter();
  cachedRouteModules.set(vitePath, mod);
  return mod;
}

app.post('/api/chat', async (req, res) => {
  try {
    const webReq = await toWebRequest(req);
    const mod = await loadApiModule('/src/routes/api/chat.ts', () => import('./src/routes/api/chat.ts'));
    const webRes = await mod.handleChatPost(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/chat error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

app.all('/api/memory', async (req, res) => {
  try {
    const webReq = await toWebRequest(req);
    const mod = await loadApiModule('/src/routes/api/memory.ts', () => import('./src/routes/api/memory.ts'));
    const webRes = await mod.handleMemoryRequest(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/memory error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

app.all('/api/library', async (req, res) => {
  try {
    const webReq = await toWebRequest(req);
    const mod = await loadApiModule('/src/routes/api/library.ts', () => import('./src/routes/api/library.ts'));
    const webRes = await mod.handleLibraryRequest(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/library error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

app.all('/api/flow', async (req, res) => {
  try {
    const webReq = await toWebRequest(req);
    const mod = await loadApiModule('/src/routes/api/flow.ts', () => import('./src/routes/api/flow.ts'));
    const webRes = await mod.handleFlowRequest(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/flow error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

app.all(['/api/auth/github', '/api/auth/github/*'], async (req, res) => {
  try {
    const webReq = await toWebRequest(req);
    const mod = await loadApiModule('/src/routes/api/auth-github.ts', () => import('./src/routes/api/auth-github.ts'));
    const webRes = await mod.handleGitHubAuth(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/auth/github error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

app.all('/api/subscription', async (req, res) => {
  try {
    const webReq = await toWebRequest(req);
    const mod = await loadApiModule('/src/routes/api/subscription.ts', () => import('./src/routes/api/subscription.ts'));
    const webRes = await mod.handleSubscriptionRequest(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/subscription error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

app.get('/api/legal', async (req, res) => {
  try {
    const webReq = await toWebRequest(req);
    const mod = await loadApiModule('/src/routes/api/legal.ts', () => import('./src/routes/api/legal.ts'));
    const webRes = await mod.handleLegalRequest(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/legal error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

app.post('/api/transcribe', async (req, res) => {
  try {
    const webReq = await toWebRequest(req);
    const mod = await loadApiModule('/src/routes/api/transcribe.ts', () => import('./src/routes/api/transcribe.ts'));
    const webRes = await mod.handleTranscribePost(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/transcribe error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

const NO_WS_VITE_CLIENT_SHIM = `
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return \`\${pathname}?\${queryToInject}\${search ? '&' + search.slice(1) : ''}\${hash || ''}\`;
}
export class ErrorOverlay extends HTMLElement {}
`;

async function startServer() {
  const httpServer = http.createServer(app);

  if (!isProduction && !isBundledServer) {
    if (disableHmr) {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(NO_WS_VITE_CLIENT_SHIM);
      });
    }
    const { createServer } = await import('vite');
    viteDevServer = await createServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: disableHmr ? false : { server: httpServer },
        watch: disableHmr ? null : {},
      },
      appType: 'spa',
    });
    app.use(viteDevServer.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;
  httpServer.requestTimeout = 300_000;

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port} (${isProduction || isBundledServer ? 'production' : 'development'})`);
    // Pre-warm /api/chat module and provider shard health in background so the very first user message has ~0ms cold-start overhead
    void loadApiModule('/src/routes/api/chat.ts', () => import('./src/routes/api/chat.ts')).catch(() => {});
    void loadApiModule('/src/lib/deepseek-models.ts', () => import('./src/lib/deepseek-models.ts'))
      .then((mod) => {
        if (typeof mod?.prewarmDeepSeekProviderHealth === 'function') {
          return mod.prewarmDeepSeekProviderHealth(
            (process.env.DEEPSEEK_API_KEY || '').trim(),
            (process.env.APIMIRA_API_KEY || '').trim(),
            (process.env.APIMIRA_BASE_URL || 'https://apimira.com/v1').trim(),
          );
        }
      })
      .catch(() => {});
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
