#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";

const host = process.env.MOCK_UPSTREAM_HOST || "127.0.0.1";
const port = Number(process.env.MOCK_UPSTREAM_PORT || 39001);
const mode = process.env.MOCK_UPSTREAM_MODE || "stream-text";
const logFile = process.env.MOCK_UPSTREAM_LOG_FILE || "";

function appendLog(payload) {
  if (!logFile) return;
  fs.appendFileSync(logFile, `${JSON.stringify(payload)}\n`, "utf8");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, code, payload) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendSseStart(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
}

function sendSseChunk(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendSseDone(res) {
  res.write("data: [DONE]\n\n");
  res.end();
}

function baseChunk() {
  return {
    id: `mock-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "mock-model",
  };
}

function nonStreamCompletion(content) {
  return {
    id: `mock-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "mock-model",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content,
        },
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 8,
      total_tokens: 18,
    },
  };
}

async function handleChat(req, res, reqJson) {
  const stream = Boolean(reqJson?.stream);

  if (!stream) {
    sendJson(res, 200, nonStreamCompletion("fallback-ok"));
    return;
  }

  if (mode === "stream-fail-pre-first") {
    req.socket.destroy(new Error("mock pre-first failure"));
    return;
  }

  if (mode === "stream-fail-after-first") {
    const base = baseChunk();
    sendSseStart(res);
    sendSseChunk(res, {
      ...base,
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    });
    sendSseChunk(res, {
      ...base,
      choices: [{ index: 0, delta: { content: "partial" }, finish_reason: null }],
    });
    setTimeout(() => {
      req.socket.destroy(new Error("mock post-first failure"));
    }, 20);
    return;
  }

  if (mode === "stream-toolcall") {
    const base = baseChunk();
    sendSseStart(res);
    sendSseChunk(res, {
      ...base,
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    });
    sendSseChunk(res, {
      ...base,
      choices: [{ index: 0, delta: { content: "<tool_call><function=get_weather><parameter=city>Bei" }, finish_reason: null }],
    });
    sendSseChunk(res, {
      ...base,
      choices: [{ index: 0, delta: { content: "jing</parameter></function></tool_call>" }, finish_reason: null }],
    });
    sendSseChunk(res, {
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 8,
        total_tokens: 18,
      },
    });
    sendSseDone(res);
    return;
  }

  const base = baseChunk();
  sendSseStart(res);
  sendSseChunk(res, {
    ...base,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  });
  sendSseChunk(res, {
    ...base,
    choices: [{ index: 0, delta: { content: "hello " }, finish_reason: null }],
  });
  setTimeout(() => {
    sendSseChunk(res, {
      ...base,
      choices: [{ index: 0, delta: { content: "world" }, finish_reason: null }],
    });
    sendSseChunk(res, {
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 8,
        total_tokens: 18,
      },
    });
    sendSseDone(res);
  }, 30);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      sendJson(res, 404, { error: { message: "not found" } });
      return;
    }

    const raw = await readBody(req);
    let reqJson = {};
    try {
      reqJson = JSON.parse(raw || "{}");
    } catch {
      sendJson(res, 400, { error: { message: "invalid json" } });
      return;
    }

    appendLog({
      ts: new Date().toISOString(),
      mode,
      request: reqJson,
    });

    await handleChat(req, res, reqJson);
  } catch (err) {
    sendJson(res, 500, { error: { message: String(err?.message || err) } });
  }
});

server.listen(port, host, () => {
  console.log(`[mock-upstream] listening on http://${host}:${port} mode=${mode}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
