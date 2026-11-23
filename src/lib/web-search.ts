export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface WebSearchRichResult {
  hits: WebSearchHit[];
  groundedSummary?: string;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtmlTags(input: string): string {
  const firstPass = decodeHtmlEntities(input).replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(firstPass).replace(/\s+/g, " ").trim();
}

const STOP_PHRASES_RE = /\b(какой|какая|какие|сколько|сейчас|сегодня|актуальный|актуальная|свежий|свежие|последний|последние|по\s+последним\s+новостям|подскажи|скажи|найди|пожалуйста|в\s+мире|whats|what's|what\s+is|current|currently|today|latest|news)\b/gi;

function buildFocusedQuery(query: string): string {
  const stripped = query
    .replace(STOP_PHRASES_RE, " ")
    .replace(/[?!.,;:()"'«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length >= 3 ? stripped : query.trim();
}

function extractQueryKeywords(query: string): string[] {
  return buildFocusedQuery(query)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^\d{4}$/.test(w));
}

function isRelevantHit(title: string, snippet: string, url: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = `${title} ${snippet} ${url}`.toLowerCase();
  return keywords.some((kw) => {
    const stem = kw.length >= 5 ? kw.slice(0, kw.length - 1) : kw;
    return haystack.includes(kw) || (stem.length >= 4 && haystack.includes(stem));
  });
}


async function searchDuckDuckGoInstant(query: string): Promise<WebSearchHit[]> {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      {
        headers: { "user-agent": "Mozilla/5.0 (compatible; IGseekSearch/1.0)" },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const hits: WebSearchHit[] = [];
    if (data?.AbstractText && data?.AbstractURL) {
      hits.push({
        title: String(data.Heading || query),
        url: String(data.AbstractURL),
        snippet: String(data.AbstractText).slice(0, 420),
        source: String(data.AbstractSource || "DuckDuckGo IA"),
      });
    }
    if (data?.Answer && typeof data.Answer === "string") {
      hits.push({
        title: query,
        url: "https://duckduckgo.com/?q=" + encodeURIComponent(query),
        snippet: data.Answer.slice(0, 320),
        source: "DuckDuckGo Answer",
      });
    }
    return hits;
  } catch {
    return [];
  }
}

async function searchDuckDuckGoHtml(query: string): Promise<WebSearchHit[]> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return [];
    const html = await res.text();
    if (/anomaly|captcha|bots use duckduckgo|challenge/i.test(html)) {
      return [];
    }

    const blocks = html.split(/class="result\s+results_links/).slice(1, 10);
    const hits: WebSearchHit[] = [];
    for (const block of blocks) {
      const aMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!aMatch) continue;
      let href = decodeHtmlEntities(aMatch[1]).trim();
      const uddg = href.match(/[?&]uddg=([^&]+)/);
      if (uddg) {
        try {
          href = decodeURIComponent(uddg[1]);
        } catch {
        }
      }
      if (!href.startsWith("http")) continue;
      const snipMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/);
      const title = stripHtmlTags(aMatch[2]).slice(0, 200);
      const snippet = snipMatch ? stripHtmlTags(snipMatch[1]).slice(0, 420) : "";
      if (title) {
        hits.push({ title, url: href, snippet, source: "DuckDuckGo" });
      }
      if (hits.length >= 6) break;
    }
    return hits;
  } catch {
    return [];
  }
}

async function searchBingRss(query: string): Promise<WebSearchHit[]> {
  const isCyr = /[а-яА-ЯёЁ]/.test(query);
  const keywords = extractQueryKeywords(query);
  const relaxed = keywords.slice(0, 4).join(" ");
  const attempts = isCyr
    ? [
        `q=${encodeURIComponent(query)}&format=rss&cc=RU`,
        ...(relaxed && relaxed !== query ? [`q=${encodeURIComponent(relaxed)}&format=rss&cc=RU`] : []),
      ]
    : [
        `q=${encodeURIComponent(query)}&format=rss`,
        ...(relaxed && relaxed !== query ? [`q=${encodeURIComponent(relaxed)}&format=rss`] : []),
      ];

  for (const qs of attempts) {
    try {
      const res = await fetch(`https://www.bing.com/search?${qs}`, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          "accept-language": isCyr ? "ru-RU,ru;q=0.9,en;q=0.7" : "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const hits: WebSearchHit[] = [];
      const itemRe =
        /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<\/item>/g;
      let m: RegExpExecArray | null;
      while ((m = itemRe.exec(xml)) && hits.length < 6) {
        const title = stripHtmlTags(m[1]).slice(0, 200);
        const url = decodeHtmlEntities(m[2]).trim();
        const snippet = stripHtmlTags(m[3]).slice(0, 420);
        if (!title || !url.startsWith("http")) continue;
        if (isRelevantHit(title, snippet, url, keywords)) {
          hits.push({ title, url, snippet, source: "Bing" });
        }
      }
      if (hits.length > 0) return hits;
    } catch {
    }
  }
  return [];
}

async function searchGoogleNewsRss(query: string): Promise<WebSearchHit[]> {
  const isCyr = /[а-яА-ЯёЁ]/.test(query);
  const keywords = extractQueryKeywords(query);
  const locale = isCyr ? "hl=ru&gl=RU&ceid=RU:ru" : "hl=en-US&gl=US&ceid=US:en";
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${locale}`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; IGseekSearch/1.0)" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const hits: WebSearchHit[] = [];
    const itemRe =
      /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>(?:[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>)?[\s\S]*?(?:<description>([\s\S]*?)<\/description>)?[\s\S]*?<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) && hits.length < 5) {
      const title = stripHtmlTags(m[1]).slice(0, 200);
      const url = decodeHtmlEntities(m[2]).trim();
      const pub = m[3] ? stripHtmlTags(m[3]) : "";
      const desc = m[4] ? stripHtmlTags(m[4]) : "";
      const snippet = [desc && !desc.startsWith(title.slice(0, 25)) ? desc : "", pub ? `Date: ${pub}` : ""]
        .filter(Boolean)
        .join(" • ")
        .slice(0, 360);
      if (title && url.startsWith("http") && isRelevantHit(title, snippet, url, keywords)) {
        hits.push({ title, url, snippet: snippet || title, source: "Google News" });
      }
    }
    return hits;
  } catch {
    return [];
  }
}

async function searchWikipedia(query: string): Promise<WebSearchHit[]> {
  const isCyr = /[а-яА-ЯёЁ]/.test(query);
  const keywords = extractQueryKeywords(query);
  const relaxed = keywords.slice(0, 3).join(" ") || query;
  const hosts = isCyr ? ["ru.wikipedia.org", "en.wikipedia.org"] : ["en.wikipedia.org", "ru.wikipedia.org"];

  for (const host of hosts) {
    for (const term of [query, relaxed]) {
      if (!term) continue;
      try {
        const res = await fetch(
          `https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json&srlimit=3`,
          { signal: AbortSignal.timeout(3500) },
        );
        if (!res.ok) continue;
        const json = (await res.json()) as any;
        const items = json?.query?.search || [];
        if (items.length > 0) {
          return items.map((it: any) => ({
            title: String(it.title),
            url: `https://${host}/wiki/${encodeURIComponent(String(it.title).replace(/\s+/g, "_"))}`,
            snippet: stripHtmlTags(String(it.snippet || "")).slice(0, 360),
            source: host === "ru.wikipedia.org" ? "Wikipedia RU" : "Wikipedia EN",
          }));
        }
      } catch {
      }
    }
  }
  return [];
}

function isSafePublicHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchPageExcerpt(url: string): Promise<string> {
  if (!isSafePublicHttpUrl(url) || /\.(?:pdf|zip|docx?|xlsx?|png|jpe?g|gif|webp|mp4|mp3)(?:$|\?)/i.test(url)) {
    return "";
  }
  if (url.includes("vertexaisearch.cloud.google.com") || url.includes("news.google.com/rss/articles")) return "";
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(2200),
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return "";
    const rawHtml = (await res.text()).slice(0, 120_000);
    const cleaned = rawHtml
      .replace(/<(script|style|noscript|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
    return decodeHtmlEntities(cleaned).replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim().slice(0, 900);
  } catch {
    return "";
  }
}

export async function searchWebRich(query: string, limit = 6): Promise<WebSearchRichResult> {
  const cleanQ = query.trim();
  if (!cleanQ) return { hits: [] };
  const focusedQ = buildFocusedQuery(cleanQ);

  const [ddgIaRes, ddgRes, bingRes, gnewsRes, wikiRes] = await Promise.allSettled([
    searchDuckDuckGoInstant(focusedQ),
    searchDuckDuckGoHtml(focusedQ),
    searchBingRss(focusedQ),
    searchGoogleNewsRss(focusedQ),
    searchWikipedia(focusedQ),
  ]);

  const combined: WebSearchHit[] = [
    ...(ddgIaRes.status === "fulfilled" ? ddgIaRes.value : []),
    ...(ddgRes.status === "fulfilled" ? ddgRes.value : []),
    ...(bingRes.status === "fulfilled" ? bingRes.value : []),
    ...(gnewsRes.status === "fulfilled" ? gnewsRes.value : []),
    ...(wikiRes.status === "fulfilled" ? wikiRes.value : []),
  ];

  const seenUrls = new Set<string>();
  const unique: WebSearchHit[] = [];
  for (const hit of combined) {
    const norm = hit.url.replace(/\/+$/, "").toLowerCase();
    if (seenUrls.has(norm)) continue;
    seenUrls.add(norm);
    unique.push(hit);
    if (unique.length >= limit) break;
  }

  if (unique.length > 0) {
    const enrichTargets = unique
      .filter((h) => h.snippet.length < 220)
      .slice(0, 2);
    if (enrichTargets.length > 0) {
      const excerpts = await Promise.all(enrichTargets.map((h) => fetchPageExcerpt(h.url)));
      enrichTargets.forEach((hit, idx) => {
        const excerpt = excerpts[idx];
        if (excerpt && excerpt.length > hit.snippet.length) {
          hit.snippet = excerpt;
        }
      });
    }
  }

  return {
    hits: unique,
  };
}

export async function searchWebLive(query: string, limit = 6): Promise<WebSearchHit[]> {
  const rich = await searchWebRich(query, limit);
  return rich.hits;
}
