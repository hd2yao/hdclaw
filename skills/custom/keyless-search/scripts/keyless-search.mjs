#!/usr/bin/env node

import { URL } from 'node:url';

function parseArgs(argv) {
  const out = {
    query: '',
    max: 5,
    market: 'en-US'
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
  }

  return out;
}

function decodeHtmlEntities(input) {
  if (!input) return '';
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/');
}

function stripTags(input) {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function pickTag(block, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(re);
  return match ? decodeHtmlEntities(stripTags(match[1])) : '';
}

function parseRss(xml, maxItems) {
  const items = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemBlocks) {
    const title = pickTag(block, 'title');
    const link = unwrapBingNewsLink(pickTag(block, 'link'));
    const description = pickTag(block, 'description');
    const pubDate = pickTag(block, 'pubDate');

    if (!title || !link) continue;

    items.push({
      title,
      url: link,
      snippet: description,
      publishedAt: pubDate || null
    });

    if (items.length >= maxItems) break;
  }

  return items;
}

function unwrapBingNewsLink(input) {
  if (!input) return '';
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith('bing.com')) return input;
    if (!/\/news\/apiclick\.aspx$/i.test(parsed.pathname)) return input;
    const target = parsed.searchParams.get('url');
    return target || input;
  } catch {
    return input;
  }
}

function dedupeByUrl(items, maxItems) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const url = String(item?.url ?? '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}

async function fetchBingRss({ query, market, mode }) {
  const endpoint = new URL(mode === 'news' ? 'https://www.bing.com/news/search' : 'https://www.bing.com/search');
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('format', 'rss');
  endpoint.searchParams.set('mkt', market);

  const res = await fetch(endpoint, {
    headers: {
      'User-Agent': 'openclaw-keyless-search/1.0 (+https://github.com/hd2yao/hdclaw)'
    }
  });

  if (!res.ok) {
    throw new Error(`keyless-search upstream error: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  return parseRss(xml, 50);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.query) {
    console.error('Usage: keyless-search.mjs --query "text" [--max 5] [--market en-US]');
    process.exit(2);
  }

  let newsResults = [];
  let webResults = [];

  try {
    newsResults = await fetchBingRss({ query: args.query, market: args.market, mode: 'news' });
  } catch (err) {
    console.error(`keyless-search news-rss failed: ${err?.message ?? String(err)}`);
  }

  if (newsResults.length < args.max) {
    try {
      webResults = await fetchBingRss({ query: args.query, market: args.market, mode: 'web' });
    } catch (err) {
      console.error(`keyless-search web-rss failed: ${err?.message ?? String(err)}`);
    }
  }

  const results = dedupeByUrl([...newsResults, ...webResults], args.max);

  const out = {
    query: args.query,
    provider: 'bing-rss',
    mode: newsResults.length > 0 ? 'news+web' : 'web-only',
    fetchedAt: new Date().toISOString(),
    count: results.length,
    results
  };

  console.log(JSON.stringify(out, null, 2));

  if (results.length === 0) {
    process.exitCode = 3;
  }
}

main().catch((err) => {
  console.error(`keyless-search failed: ${err?.message ?? String(err)}`);
  process.exit(1);
});
