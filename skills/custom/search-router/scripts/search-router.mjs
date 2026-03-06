#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const out = {
    query: '',
    max: 10,
    market: 'en-US',
    dryRun: false,
    timeoutMs: 45000
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--query' || arg === '-q') {
      out.query = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--max' || arg === '-n') {
      const v = Number.parseInt(argv[i + 1] ?? '', 10);
      if (Number.isFinite(v) && v > 0) {
        out.max = Math.min(v, 20);
      }
      i += 1;
      continue;
    }
    if (arg === '--market' || arg === '-m') {
      out.market = argv[i + 1] ?? out.market;
      i += 1;
      continue;
    }
    if (arg === '--timeout-ms') {
      const v = Number.parseInt(argv[i + 1] ?? '', 10);
      if (Number.isFinite(v) && v > 0) {
        out.timeoutMs = Math.min(v, 120000);
      }
      i += 1;
      continue;
    }
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }
  }

  return out;
}

function usage() {
  console.error('Usage: search-router.mjs --query "text" [--max 10] [--market en-US] [--timeout-ms 45000] [--dry-run]');
}

function trimModelId(primary) {
  if (!primary) return '';
  const slash = primary.indexOf('/');
  if (slash === -1) return primary;
  return primary.slice(slash + 1);
}

async function readPrimaryModel() {
  const configPath = process.env.OPENCLAW_CONFIG_TARGET || path.join(process.env.HOME || '', '.openclaw', 'openclaw.json');
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.agents?.defaults?.model?.primary ?? '';
  } catch {
    return '';
  }
}

function resolveOpenAiNativeContext(primaryModel) {
  const isOpenAiPrimary = primaryModel.startsWith('openai-codex/') || primaryModel.startsWith('openai/');
  const apiKey = process.env.OPENAI_API_KEY || '';
  const modelFromPrimary = trimModelId(primaryModel);
  const modelFromEnv = trimModelId(process.env.OPENCLAW_OPENAI_MODEL || '');
  const modelId = modelFromPrimary || modelFromEnv;

  if (!isOpenAiPrimary) {
    return { eligible: false, reason: 'active_model_not_openai' };
  }
  if (!modelId) {
    return { eligible: false, reason: 'openai_model_id_missing' };
  }
  if (!apiKey) {
    return { eligible: false, reason: 'openai_api_key_missing' };
  }

  return {
    eligible: true,
    modelId,
    apiKey
  };
}

function buildOpenAiResponsesUrl() {
  const raw = (process.env.OPENAI_BASE_URL || '').trim();
  if (!raw) return 'https://api.openai.com/v1/responses';
  const normalized = raw.replace(/\/+$/, '');
  if (normalized.endsWith('/v1')) {
    return `${normalized}/responses`;
  }
  return `${normalized}/v1/responses`;
}

function normalizeUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return '';
  if (!/^https?:\/\//i.test(url)) return '';
  return url;
}

function normalizeItem(item) {
  const url = normalizeUrl(item?.url ?? item?.link ?? '');
  if (!url) return null;

  const title = String(item?.title ?? item?.name ?? url).trim();
  const snippet = String(item?.snippet ?? item?.summary ?? item?.content ?? item?.description ?? '').trim();
  const publishedAtRaw = item?.publishedAt ?? item?.published_at ?? item?.publishedDate ?? item?.date ?? item?.page_age ?? null;

  return {
    title: title || url,
    url,
    snippet,
    publishedAt: publishedAtRaw ? String(publishedAtRaw) : null
  };
}

function normalizeResults(raw, max) {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.results)
      ? raw.results
      : [];

  const out = [];
  const seen = new Set();

  for (const item of list) {
    const normalized = normalizeItem(item);
    if (!normalized) continue;
    if (seen.has(normalized.url)) continue;
    seen.add(normalized.url);
    out.push(normalized);
    if (out.length >= max) break;
  }

  return out;
}

function extractJsonText(text) {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return '';
}

function collectOpenAiOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = [];
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const block of output) {
    const content = Array.isArray(block?.content) ? block.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }

  return chunks.join('\n').trim();
}

function collectOpenAiCitations(data, max) {
  const out = [];
  const seen = new Set();
  const output = Array.isArray(data?.output) ? data.output : [];

  for (const block of output) {
    const content = Array.isArray(block?.content) ? block.content : [];
    for (const part of content) {
      const annotations = Array.isArray(part?.annotations) ? part.annotations : [];
      for (const ann of annotations) {
        const url = normalizeUrl(ann?.url ?? ann?.link ?? '');
        if (!url || seen.has(url)) continue;
        seen.add(url);
        out.push({
          title: String(ann?.title ?? ann?.source ?? url),
          url,
          snippet: '',
          publishedAt: null
        });
        if (out.length >= max) return out;
      }
    }
  }

  return out;
}

const PREFERRED_DOMAIN_SUFFIXES = [
  'openai.com',
  'anthropic.com',
  'blog.google',
  'deepmind.google',
  'ai.meta.com',
  'blogs.microsoft.com',
  'nvidianews.nvidia.com',
  'techcrunch.com',
  'theverge.com',
  'venturebeat.com',
  'reuters.com',
  'bloomberg.com',
  'ft.com',
  'huggingface.co',
  'arxiv.org'
];

const GENERIC_HOME_TITLE_PATTERNS = [
  /breaking news/i,
  /latest news/i,
  /top stories/i,
  /headlines/i,
  /news homepage/i,
  /news and videos/i
];

const AI_RELEVANCE_PATTERN = /\b(ai|artificial intelligence|llm|gpt|openai|anthropic|deepmind|gemini|llama|grok|copilot|nvidia|machine learning|ml)\b/i;

function toHostname(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isPreferredDomain(hostname) {
  if (!hostname) return false;
  return PREFERRED_DOMAIN_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

function isAiRelevant(item) {
  const text = `${String(item?.title ?? '')} ${String(item?.snippet ?? '')}`.trim();
  return AI_RELEVANCE_PATTERN.test(text);
}

function isLikelyGenericHomepage(item) {
  const title = String(item?.title ?? '').trim();
  const url = String(item?.url ?? '').trim();
  if (!url) return true;

  try {
    const parsed = new URL(url);
    const pathname = (parsed.pathname || '/').replace(/\/+/g, '/');
    const rootLike = pathname === '/' || /^\/(news|home|index(\.html?)?|topics?)\/?$/i.test(pathname);
    const genericTitle = GENERIC_HOME_TITLE_PATTERNS.some((re) => re.test(title));
    return rootLike && genericTitle;
  } catch {
    return true;
  }
}

function scoreResult(item) {
  const hostname = toHostname(item?.url ?? '');
  let score = 0;
  if (!isLikelyGenericHomepage(item)) score += 4;
  if (isPreferredDomain(hostname)) score += 3;
  if (isAiRelevant(item)) score += 2;
  if (item?.publishedAt) score += 1;
  if (String(item?.snippet ?? '').trim().length >= 40) score += 1;
  return score;
}

function prioritizeAiRelevant(results) {
  const relevant = [];
  const other = [];
  for (const item of results) {
    if (isAiRelevant(item)) relevant.push(item);
    else other.push(item);
  }
  return [...relevant, ...other];
}

function mergeAndRankResults(existing, incoming, limit) {
  const map = new Map();

  const upsert = (item) => {
    const url = normalizeUrl(item?.url ?? '');
    if (!url) return;
    const normalized = {
      title: String(item?.title ?? url).trim() || url,
      url,
      snippet: String(item?.snippet ?? '').trim(),
      publishedAt: item?.publishedAt ? String(item.publishedAt) : null
    };
    const prev = map.get(url);
    if (!prev || scoreResult(normalized) > scoreResult(prev)) {
      map.set(url, normalized);
    }
  };

  for (const item of existing) upsert(item);
  for (const item of incoming) upsert(item);

  const ranked = Array.from(map.values());
  ranked.sort((a, b) => {
    const scoreDelta = scoreResult(b) - scoreResult(a);
    if (scoreDelta !== 0) return scoreDelta;
    const aPublished = a.publishedAt ? Date.parse(a.publishedAt) || 0 : 0;
    const bPublished = b.publishedAt ? Date.parse(b.publishedAt) || 0 : 0;
    return bPublished - aPublished;
  });

  return ranked.slice(0, Math.max(1, limit));
}

function applyDomainDiversity(results, limit, maxPerDomain) {
  const kept = [];
  const overflow = [];
  const domainCount = new Map();

  for (const item of results) {
    const domain = toHostname(item?.url ?? '') || '__unknown__';
    const used = domainCount.get(domain) || 0;
    if (used < maxPerDomain) {
      kept.push(item);
      domainCount.set(domain, used + 1);
    } else {
      overflow.push(item);
    }
  }

  if (kept.length < limit) {
    for (const item of overflow) {
      kept.push(item);
      if (kept.length >= limit) break;
    }
  }

  return kept.slice(0, Math.max(1, limit));
}

function evaluateQuality(results) {
  const domains = new Set();
  let genericCount = 0;
  let preferredCount = 0;
  let aiRelevantCount = 0;
  for (const item of results) {
    const hostname = toHostname(item?.url ?? '');
    if (hostname) domains.add(hostname);
    if (isLikelyGenericHomepage(item)) genericCount += 1;
    if (isPreferredDomain(hostname)) preferredCount += 1;
    if (isAiRelevant(item)) aiRelevantCount += 1;
  }

  const count = results.length;
  return {
    count,
    uniqueDomains: domains.size,
    preferredCount,
    aiRelevantCount,
    genericCount,
    nonGenericCount: Math.max(0, count - genericCount)
  };
}

function looksLikeAiNewsQuery(query) {
  const q = String(query || '').toLowerCase();
  const hasAi = /\b(ai|llm|gpt|openai|anthropic|deepmind|gemini|meta|microsoft|nvidia)\b/.test(q);
  const hasNewsIntent = /\b(news|latest|today|recent|hotspot|report|brief)\b/.test(q) || /最新|日报|战报|热点/.test(q);
  return hasAi && hasNewsIntent;
}

function buildQueryPlan(query) {
  const base = String(query ?? '').trim();
  if (!base) return [];
  if (!looksLikeAiNewsQuery(base)) return [base];

  const refined = [
    `${base} site:openai.com OR site:anthropic.com OR site:blog.google OR site:deepmind.google OR site:ai.meta.com OR site:blogs.microsoft.com OR site:nvidianews.nvidia.com`,
    `${base} site:techcrunch.com OR site:theverge.com OR site:venturebeat.com OR site:reuters.com OR site:bloomberg.com`,
    `${base} site:huggingface.co/blog OR site:arxiv.org OR site:ft.com/technology`,
    `latest AI announcement site:openai.com`,
    `latest AI announcement site:anthropic.com`,
    `latest AI announcement site:blog.google`,
    `latest AI announcement site:deepmind.google`,
    `latest AI announcement site:ai.meta.com`,
    `latest AI announcement site:nvidianews.nvidia.com`
  ];

  return Array.from(new Set([base, ...refined]));
}

function needsAiNewsRefinement(results, max) {
  const quality = evaluateQuality(results);
  const requiredCount = Math.max(6, Math.min(max, 10));
  if (quality.count < requiredCount) return true;
  if (quality.preferredCount < 3) return true;
  if (quality.uniqueDomains < 5) return true;
  if (quality.nonGenericCount < Math.ceil(requiredCount * 0.7)) return true;
  if (quality.aiRelevantCount < Math.ceil(requiredCount * 0.7)) return true;
  return false;
}

async function searchWithOpenAiNative({ query, max, modelId, apiKey, timeoutMs }) {
  const payload = {
    model: modelId,
    tools: [{ type: 'web_search_preview' }],
    input: `Search the web for: ${query}\nReturn only strict JSON with schema {"results":[{"title":"...","url":"https://...","snippet":"...","publishedAt":"..."}]}. Limit ${max} items.`,
    temperature: 0,
    max_output_tokens: 1400
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;

  try {
    res = await fetch(buildOpenAiResponsesUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  const rawBody = await res.text();
  let data = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    const msg = data?.error?.message || rawBody || `${res.status} ${res.statusText}`;
    throw new Error(`openai_native_http_error: ${msg}`);
  }

  const outputText = collectOpenAiOutputText(data);
  const jsonText = extractJsonText(outputText);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const normalized = normalizeResults(parsed, max);
      if (normalized.length > 0) {
        return normalized;
      }
    } catch {
      // fall through to citation parsing
    }
  }

  const citations = collectOpenAiCitations(data, max);
  if (citations.length > 0) {
    return citations;
  }

  throw new Error('openai_native_empty_results');
}

function runNodeScript(scriptPath, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...args], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error((stderr || stdout || `exit_${code}`).trim()));
        return;
      }
      resolve(stdout);
    });
  });
}

async function searchWithTavily({ query, max, timeoutMs }) {
  const selfDir = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.resolve(selfDir, '../../tavily-search/scripts/tavily-search.mjs');
  const raw = await runNodeScript(scriptPath, ['--query', query, '--max', String(max)], timeoutMs);
  const parsed = JSON.parse(raw);
  const normalized = normalizeResults(parsed, max);
  if (normalized.length === 0) {
    throw new Error('tavily_empty_results');
  }
  return normalized;
}

async function searchWithKeyless({ query, max, market, timeoutMs }) {
  const selfDir = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.resolve(selfDir, '../../keyless-search/scripts/keyless-search.mjs');
  const raw = await runNodeScript(scriptPath, ['--query', query, '--max', String(max), '--market', market], timeoutMs);
  const parsed = JSON.parse(raw);
  const normalized = normalizeResults(parsed, max);
  if (normalized.length === 0) {
    throw new Error('keyless_empty_results');
  }
  return normalized;
}

async function searchWithBrave({ query, max, timeoutMs }) {
  const apiKey = process.env.OPENCLAW_WEB_SEARCH_API_KEY || process.env.BRAVE_API_KEY || '';
  if (!apiKey) {
    throw new Error('brave_api_key_missing');
  }

  const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('count', String(Math.min(max, 20)));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;

  try {
    res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`brave_http_error: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const rawResults = Array.isArray(data?.web?.results) ? data.web.results : [];
  const normalized = normalizeResults(rawResults, max);

  if (normalized.length === 0) {
    throw new Error('brave_empty_results');
  }

  return normalized;
}

function attemptSummary(route, status, detail = '', query = '') {
  const out = { route, status, detail };
  if (query) out.query = query;
  return out;
}

function isQuotaError(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('quota') || text.includes('insufficient_quota') || text.includes('billing');
}

async function runRouteChain({ query, args, primaryModel, native, tavilyKey, braveKey, attempts }) {
  let disableNative = false;

  if (native.eligible) {
    try {
      const results = await searchWithOpenAiNative({
        query,
        max: args.max,
        modelId: native.modelId,
        apiKey: native.apiKey,
        timeoutMs: args.timeoutMs
      });

      attempts.push(attemptSummary('openai-native', 'success', `results=${results.length}`, query));
      return { route: 'openai-native', results, disableNative };
    } catch (err) {
      const detail = err?.message ?? String(err);
      attempts.push(attemptSummary('openai-native', 'error', detail, query));
      if (isQuotaError(detail)) {
        disableNative = true;
      }
    }
  } else {
    attempts.push(attemptSummary('openai-native', 'skip', native.reason, query));
  }

  if (tavilyKey) {
    try {
      const results = await searchWithTavily({ query, max: args.max, timeoutMs: args.timeoutMs });
      attempts.push(attemptSummary('tavily', 'success', `results=${results.length}`, query));
      return { route: 'tavily', results, disableNative };
    } catch (err) {
      attempts.push(attemptSummary('tavily', 'error', err?.message ?? String(err), query));
    }
  } else {
    attempts.push(attemptSummary('tavily', 'skip', 'tavily_api_key_missing', query));
  }

  try {
    const results = await searchWithKeyless({ query, max: args.max, market: args.market, timeoutMs: args.timeoutMs });
    attempts.push(attemptSummary('keyless', 'success', `results=${results.length}`, query));
    return { route: 'keyless', results, disableNative };
  } catch (err) {
    attempts.push(attemptSummary('keyless', 'error', err?.message ?? String(err), query));
  }

  if (braveKey) {
    try {
      const results = await searchWithBrave({ query, max: args.max, timeoutMs: args.timeoutMs });
      attempts.push(attemptSummary('brave', 'success', `results=${results.length}`, query));
      return { route: 'brave', results, disableNative };
    } catch (err) {
      attempts.push(attemptSummary('brave', 'error', err?.message ?? String(err), query));
    }
  } else {
    attempts.push(attemptSummary('brave', 'skip', 'brave_api_key_missing', query));
  }

  return { route: 'none', results: [], disableNative };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.query) {
    usage();
    process.exit(2);
  }

  const primaryModel = await readPrimaryModel();
  const attempts = [];
  const queryPlan = buildQueryPlan(args.query);
  const aiNewsMode = looksLikeAiNewsQuery(args.query);

  const native = resolveOpenAiNativeContext(primaryModel);
  const tavilyKey = process.env.TAVILY_API_KEY || '';
  const braveKey = process.env.OPENCLAW_WEB_SEARCH_API_KEY || process.env.BRAVE_API_KEY || '';

  if (args.dryRun) {
    attempts.push(attemptSummary('openai-native', native.eligible ? 'planned' : 'skip', native.eligible ? 'eligible' : native.reason));
    attempts.push(attemptSummary('tavily', tavilyKey ? 'planned' : 'skip', tavilyKey ? 'api_key_present' : 'tavily_api_key_missing'));
    attempts.push(attemptSummary('keyless', 'planned', 'always_available'));
    attempts.push(attemptSummary('brave', braveKey ? 'planned' : 'skip', braveKey ? 'api_key_present' : 'brave_api_key_missing'));

    console.log(JSON.stringify({
      query: args.query,
      queryPlan,
      aiNewsMode,
      fetchedAt: new Date().toISOString(),
      primaryModel,
      route: 'dry-run',
      count: 0,
      results: [],
      attempts
    }, null, 2));
    return;
  }

  const executedQueries = [];
  let workingNative = { ...native };
  let primaryRoute = 'none';
  let merged = [];

  for (const plannedQuery of queryPlan) {
    executedQueries.push(plannedQuery);
    const round = await runRouteChain({
      query: plannedQuery,
      args,
      primaryModel,
      native: workingNative,
      tavilyKey,
      braveKey,
      attempts
    });

    if (round.disableNative) {
      workingNative = { eligible: false, reason: 'openai_quota_exceeded' };
    }

    if (round.results.length === 0) {
      continue;
    }

    if (primaryRoute === 'none') {
      primaryRoute = round.route;
    }

    merged = mergeAndRankResults(merged, round.results, Math.max(args.max * 5, args.max));

    if (!aiNewsMode) {
      if (merged.length >= args.max) break;
      continue;
    }

    const candidate = applyDomainDiversity(merged, args.max, 2);
    if (candidate.length >= args.max && !needsAiNewsRefinement(candidate, args.max)) {
      break;
    }
  }

  const rankedFinalPool = mergeAndRankResults([], merged, Math.max(args.max * 3, args.max));
  const aiBiasedPool = aiNewsMode ? prioritizeAiRelevant(rankedFinalPool) : rankedFinalPool;
  const finalResults = aiNewsMode
    ? applyDomainDiversity(aiBiasedPool, args.max, 2)
    : rankedFinalPool.slice(0, args.max);
  const quality = evaluateQuality(finalResults);

  if (finalResults.length > 0) {
    console.log(JSON.stringify({
      query: args.query,
      queryPlan,
      queriesExecuted: executedQueries,
      aiNewsMode,
      fetchedAt: new Date().toISOString(),
      primaryModel,
      route: primaryRoute,
      count: finalResults.length,
      quality,
      results: finalResults,
      attempts
    }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    query: args.query,
    queryPlan,
    queriesExecuted: executedQueries,
    aiNewsMode,
    fetchedAt: new Date().toISOString(),
    primaryModel,
    route: 'none',
    count: 0,
    quality,
    results: [],
    attempts
  }, null, 2));
  process.exitCode = 3;
}

main().catch((err) => {
  console.error(`search-router failed: ${err?.message ?? String(err)}`);
  process.exit(1);
});
