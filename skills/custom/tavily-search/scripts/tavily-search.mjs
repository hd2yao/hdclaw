#!/usr/bin/env node

function parseArgs(argv) {
  const out = {
    query: '',
    max: 5,
    topic: 'news',
    depth: 'advanced'
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
        out.max = Math.min(v, 10);
      }
      i += 1;
      continue;
    }
    if (arg === '--topic') {
      out.topic = argv[i + 1] ?? out.topic;
      i += 1;
      continue;
    }
    if (arg === '--depth') {
      out.depth = argv[i + 1] ?? out.depth;
      i += 1;
      continue;
    }
  }

  return out;
}

function normalizePublishedTime(item) {
  const raw = item?.published_date ?? item?.publishedDate ?? item?.date ?? null;
  if (!raw) return null;
  return String(raw);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.query) {
    console.error('Usage: tavily-search.mjs --query "text" [--max 5] [--topic news] [--depth advanced]');
    process.exit(2);
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.error('error: missing_tavily_api_key');
    console.error('message: TAVILY_API_KEY is required. Set it in .env.local and run make sync.');
    process.exit(2);
  }

  const payload = {
    api_key: apiKey,
    query: args.query,
    search_depth: args.depth,
    topic: args.topic,
    max_results: args.max,
    include_answer: false,
    include_images: false,
    include_raw_content: false
  };

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('error: tavily_http_error');
    console.error(`status: ${res.status}`);
    console.error(`detail: ${detail}`);
    process.exit(1);
  }

  const data = await res.json();
  const rawResults = Array.isArray(data?.results) ? data.results : [];
  const results = rawResults
    .filter((item) => typeof item?.url === 'string' && item.url.length > 0)
    .map((item) => ({
      title: item?.title ?? '',
      url: item.url,
      snippet: item?.content ?? '',
      score: typeof item?.score === 'number' ? item.score : null,
      publishedAt: normalizePublishedTime(item)
    }));

  if (results.length === 0) {
    console.error('error: tavily_response_invalid');
    console.error('message: no usable results from Tavily');
    process.exit(3);
  }

  const out = {
    provider: 'tavily',
    query: args.query,
    fetchedAt: new Date().toISOString(),
    count: results.length,
    results
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(`error: tavily_unhandled`);
  console.error(`message: ${err?.message ?? String(err)}`);
  process.exit(1);
});
