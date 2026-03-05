#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import http from "node:http";
import { URL } from "node:url";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 31001;
const DEFAULT_UPSTREAM = "http://127.0.0.1:30000/v1";

const host = process.env.SGLANG_ADAPTER_HOST?.trim() || DEFAULT_HOST;
const port = toPositiveInt(process.env.SGLANG_ADAPTER_PORT, DEFAULT_PORT);
const upstreamBase = (process.env.SGLANG_UPSTREAM_BASE_URL?.trim() || DEFAULT_UPSTREAM).replace(/\/+$/, "");
const upstreamUrlBase = new URL(upstreamBase);
const upstreamPathPrefix = upstreamUrlBase.pathname.replace(/\/+$/, "");
const debug = /^1|true|yes$/i.test(process.env.SGLANG_ADAPTER_DEBUG?.trim() || "");
const streamMode = parseStreamMode(process.env.SGLANG_ADAPTER_STREAM_MODE);
const streamFallbackEnabled = parseBoolean(process.env.SGLANG_ADAPTER_STREAM_FALLBACK, true);

function toPositiveInt(raw, fallback) {
  const value = Number(raw);
  if (Number.isInteger(value) && value > 0) return value;
  return fallback;
}

function parseBoolean(raw, fallback) {
  if (raw == null || String(raw).trim() === "") return fallback;
  return /^1|true|yes|on$/i.test(String(raw).trim());
}

function parseStreamMode(raw) {
  const value = String(raw ?? "proxy").trim().toLowerCase();
  if (value === "proxy" || value === "legacy") return value;
  return "proxy";
}

function logDebug(message) {
  if (debug) console.log(`[${new Date().toISOString()}][sglang-adapter][debug] ${message}`);
}

function logInfo(message) {
  console.log(`[${new Date().toISOString()}][sglang-adapter] ${message}`);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function coerceParameterValue(rawValue) {
  const value = rawValue.trim();
  if (!value) return "";
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function extractToolCallsFromText(rawText) {
  const text = String(rawText ?? "");
  const blocks = [...text.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi)];
  if (blocks.length === 0) return [];

  const parsed = [];
  for (const block of blocks) {
    const inner = block[1] ?? "";
    const fnMatch = inner.match(/<function=([^>\s]+)>\s*([\s\S]*?)\s*<\/function>/i);
    if (!fnMatch) continue;
    const name = String(fnMatch[1] ?? "").trim();
    if (!name) continue;

    const args = {};
    const paramsBody = fnMatch[2] ?? "";
    const paramMatches = [...paramsBody.matchAll(/<parameter=([^>\s]+)>\s*([\s\S]*?)\s*<\/parameter>/gi)];
    for (const paramMatch of paramMatches) {
      const key = String(paramMatch[1] ?? "").trim();
      if (!key) continue;
      args[key] = coerceParameterValue(paramMatch[2] ?? "");
    }

    parsed.push({ name, args });
  }
  return parsed;
}

function stripInternalMarkers(rawText) {
  const text = String(rawText ?? "");
  const noThink = text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .replace(/<\/?final\b[^>]*>/gi, "");
  const noTool = noThink.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  return noTool.trim();
}

function looksLikeMetaPreamble(text) {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  if (normalized.length > 280) return false;

  if (/^(user|the user)\b/.test(normalized)) return true;
  if (/^用户/.test(normalized)) return true;
  if (/\bi should\b/.test(normalized)) return true;
  if (/no tools needed/.test(normalized)) return true;
  if (/casual(,| )friendly|friendly response|intent summary/.test(normalized)) return true;
  if (/作为[^。]{0,40}(角色|助手|回应|回复)/.test(normalized)) return true;
  return false;
}

function stripLeadingMetaPreamble(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) return text;
  const match = text.match(/^([\s\S]*?)\n{2,}([\s\S]*)$/);
  if (match) {
    const firstParagraph = (match[1] ?? "").trim();
    const remaining = (match[2] ?? "").trimStart();
    if (remaining && looksLikeMetaPreamble(firstParagraph)) return remaining;
  }

  const lines = text.split(/\r?\n/);
  if (lines.length >= 2) {
    const firstLine = (lines[0] ?? "").trim();
    if (looksLikeMetaPreamble(firstLine)) {
      const rest = lines.slice(1).join("\n").trimStart();
      if (rest) return rest;
    }
  }
  return text;
}

function sanitizeUserFacingText(rawText) {
  return stripLeadingMetaPreamble(stripInternalMarkers(rawText));
}

function toOpenAIToolCall(parsedCall) {
  return {
    id: `call_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    type: "function",
    function: {
      name: parsedCall.name,
      arguments: JSON.stringify(parsedCall.args ?? {}),
    },
  };
}

function transformChatCompletionPayload(payload) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  let converted = false;

  for (const choice of choices) {
    const message = choice?.message;
    if (!message || typeof message !== "object") continue;
    const hasNativeToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
    if (hasNativeToolCalls) continue;

    const content = typeof message.content === "string" ? message.content : "";
    if (!content) continue;

    const parsedCalls = extractToolCallsFromText(content);
    if (parsedCalls.length === 0) {
      const cleaned = sanitizeUserFacingText(content);
      if (cleaned !== content) {
        message.content = cleaned || null;
        converted = true;
      }
      continue;
    }

    message.tool_calls = parsedCalls.map(toOpenAIToolCall);
    message.content = null;
    choice.finish_reason = "tool_calls";
    converted = true;
  }

  return { payload, converted };
}

function chunkBase(completion) {
  return {
    id: completion?.id || `chatcmpl-adapter-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Number.isInteger(completion?.created) ? completion.created : Math.floor(Date.now() / 1000),
    model: completion?.model || "unknown-model",
  };
}

function writeSseHeaders(res, mode) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-openclaw-adapter-stream-mode": mode,
  });
}

function sendSseData(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendSseDone(res) {
  res.write("data: [DONE]\n\n");
  res.end();
}

function writeSseFromCompletion(res, completion, mode) {
  const choice = completion?.choices?.[0] ?? {};
  const message = choice?.message ?? {};
  const finishReason = choice?.finish_reason || "stop";
  const base = chunkBase(completion);

  writeSseHeaders(res, mode);
  sendSseData(res, {
    ...base,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  });

  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  if (toolCalls.length > 0) {
    for (let index = 0; index < toolCalls.length; index += 1) {
      const call = toolCalls[index];
      sendSseData(res, {
        ...base,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index,
                  id: call.id,
                  type: "function",
                  function: {
                    name: call.function?.name ?? "",
                    arguments: call.function?.arguments ?? "{}",
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      });
    }
  } else if (typeof message.content === "string" && message.content.length > 0) {
    sendSseData(res, {
      ...base,
      choices: [{ index: 0, delta: { content: message.content }, finish_reason: null }],
    });
  }

  sendSseData(res, {
    ...base,
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    ...(completion?.usage ? { usage: completion.usage } : {}),
  });
  sendSseDone(res);
}

function buildForwardHeaders(reqHeaders, body) {
  const headers = {};
  for (const [key, value] of Object.entries(reqHeaders)) {
    if (value == null) continue;
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "content-length") continue;
    headers[key] = value;
  }
  headers["x-openclaw-sglang-adapter"] = "1";
  if (body) headers["content-length"] = String(body.length);
  return headers;
}

async function forwardRaw(req, res, targetUrl, body) {
  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers: buildForwardHeaders(req.headers, body),
    body: body.length > 0 ? body : undefined,
  });

  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") || "application/octet-stream",
  });
  res.end(buffer);
}

function buildTargetUrl(incomingUrl) {
  let path = incomingUrl.pathname || "/";
  if (upstreamPathPrefix && path.startsWith(`${upstreamPathPrefix}/`)) {
    path = path.slice(upstreamPathPrefix.length);
  } else if (upstreamPathPrefix && path === upstreamPathPrefix) {
    path = "/";
  }

  const normalizedPath = `${upstreamPathPrefix}${path.startsWith("/") ? path : `/${path}`}`.replace(/\/{2,}/g, "/");
  return new URL(`${upstreamUrlBase.origin}${normalizedPath}${incomingUrl.search || ""}`);
}

function parseSseBlocks(buffer) {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = [];
  let rest = normalized;
  while (true) {
    const boundary = rest.indexOf("\n\n");
    if (boundary < 0) break;
    blocks.push(rest.slice(0, boundary));
    rest = rest.slice(boundary + 2);
  }
  return { blocks, rest };
}

function decodeSseData(block) {
  const lines = String(block || "").split("\n");
  const dataLines = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    dataLines.push(line.slice(5).trimStart());
  }
  return dataLines.join("\n").trim();
}

function nonStreamRequest(requestJson) {
  const upstreamRequest = {
    ...requestJson,
    stream: false,
  };
  delete upstreamRequest.stream_options;
  return upstreamRequest;
}

function streamRequest(requestJson) {
  const upstreamRequest = {
    ...requestJson,
    stream: true,
  };
  return upstreamRequest;
}

async function fetchChatCompletion(req, targetUrl, upstreamRequest) {
  const body = JSON.stringify(upstreamRequest);
  return fetch(targetUrl, {
    method: "POST",
    headers: buildForwardHeaders(req.headers, Buffer.from(body)),
    body,
  });
}

async function handleNonStreamChat(req, res, targetUrl, requestJson, options) {
  const mode = options?.mode || "legacy";
  const asStream = Boolean(options?.asStream);
  const upstream = await fetchChatCompletion(req, targetUrl, nonStreamRequest(requestJson));
  const raw = await upstream.text();

  if (!upstream.ok) {
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "text/plain; charset=utf-8",
      "x-openclaw-adapter-stream-mode": mode,
    });
    res.end(raw);
    return;
  }

  let completion;
  try {
    completion = JSON.parse(raw);
  } catch {
    res.writeHead(502, {
      "content-type": "application/json; charset=utf-8",
      "x-openclaw-adapter-stream-mode": mode,
    });
    res.end(JSON.stringify({ error: { message: "Upstream returned non-JSON chat completion payload" } }));
    return;
  }

  const transformed = transformChatCompletionPayload(completion);
  if (transformed.converted) {
    logInfo("converted textual <tool_call> output to standard tool_calls");
  } else {
    logDebug("forwarded completion without tool-call conversion");
  }

  if (asStream) {
    writeSseFromCompletion(res, transformed.payload, mode);
    return;
  }

  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "x-openclaw-adapter-stream-mode": mode,
  });
  res.end(JSON.stringify(transformed.payload));
}

function makeStreamState() {
  return {
    base: null,
    roleSent: false,
    markerSeen: false,
    plainTail: "",
    toolBuffer: "",
    finishReason: "stop",
    usage: null,
    toolCallIndex: 0,
    emittedToolCalls: false,
    introResolved: false,
    introBuffer: "",
  };
}

function ensureChunkBase(state, chunk) {
  if (state.base) return;
  state.base = {
    id: chunk?.id || `chatcmpl-adapter-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Number.isInteger(chunk?.created) ? chunk.created : Math.floor(Date.now() / 1000),
    model: chunk?.model || "unknown-model",
  };
}

function sendRoleChunk(res, state) {
  if (state.roleSent) return;
  sendSseData(res, {
    ...state.base,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  });
  state.roleSent = true;
}

function sendTextChunk(res, state, text) {
  if (!text) return;
  sendSseData(res, {
    ...state.base,
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  });
}

function emitTextWithIntroGuard(res, state, text, force = false) {
  if (state.introResolved) {
    if (text) sendTextChunk(res, state, text);
    return;
  }

  if (text) state.introBuffer += text;
  const buffer = state.introBuffer;
  if (!buffer) {
    if (force) state.introResolved = true;
    return;
  }

  if (!force && !/\n{2,}/.test(buffer)) return;

  const cleaned = stripLeadingMetaPreamble(buffer);
  state.introResolved = true;
  state.introBuffer = "";
  if (cleaned) sendTextChunk(res, state, cleaned);
}

function sendToolCallChunk(res, state, call) {
  sendSseData(res, {
    ...state.base,
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: state.toolCallIndex,
              id: call.id,
              type: "function",
              function: {
                name: call.function?.name ?? "",
                arguments: call.function?.arguments ?? "{}",
              },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  });
  state.toolCallIndex += 1;
  state.emittedToolCalls = true;
}

function consumeContentDelta(res, state, text) {
  const marker = "<tool_call>";
  if (state.markerSeen) {
    state.toolBuffer += text;
    return;
  }

  const combined = state.plainTail + text;
  const markerIndex = combined.indexOf(marker);
  if (markerIndex >= 0) {
    const prefix = combined.slice(0, markerIndex);
    if (prefix) emitTextWithIntroGuard(res, state, prefix);
    state.markerSeen = true;
    state.toolBuffer += combined.slice(markerIndex);
    state.plainTail = "";
    return;
  }

  const guard = marker.length - 1;
  if (combined.length <= guard) {
    state.plainTail = combined;
    return;
  }

  const emitPart = combined.slice(0, combined.length - guard);
  const keepTail = combined.slice(combined.length - guard);
  if (emitPart) emitTextWithIntroGuard(res, state, emitPart);
  state.plainTail = keepTail;
}

function flushBufferedOutput(res, state) {
  if (!state.markerSeen) {
    if (state.plainTail) {
      emitTextWithIntroGuard(res, state, state.plainTail, true);
      state.plainTail = "";
    } else {
      emitTextWithIntroGuard(res, state, "", true);
    }
    return;
  }

  const parsedCalls = extractToolCallsFromText(state.toolBuffer);
  if (parsedCalls.length > 0) {
    for (const parsed of parsedCalls) {
      sendToolCallChunk(res, state, toOpenAIToolCall(parsed));
    }
    state.finishReason = "tool_calls";
    return;
  }

  const cleaned = sanitizeUserFacingText(state.toolBuffer);
  if (cleaned) emitTextWithIntroGuard(res, state, cleaned, true);
}

async function handleStreamChat(req, res, targetUrl, requestJson, requestId) {
  const startedAt = Date.now();
  const state = makeStreamState();
  const decoder = new TextDecoder();
  let pending = "";
  let streamOpened = false;
  let firstChunkMs = -1;

  const openStream = () => {
    if (streamOpened) return;
    writeSseHeaders(res, "proxy");
    streamOpened = true;
  };

  const markFirstChunk = () => {
    if (firstChunkMs >= 0) return;
    firstChunkMs = Date.now() - startedAt;
  };

  const emitAndTrack = (fn) => {
    openStream();
    markFirstChunk();
    fn();
  };

  try {
    const upstream = await fetchChatCompletion(req, targetUrl, streamRequest(requestJson));
    if (!upstream.ok) {
      const raw = await upstream.text();
      res.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") || "text/plain; charset=utf-8",
        "x-openclaw-adapter-stream-mode": "proxy",
      });
      res.end(raw);
      return;
    }

    if (!upstream.body) {
      throw new Error("upstream stream body missing");
    }

    for await (const chunk of upstream.body) {
      pending += decoder.decode(chunk, { stream: true });
      const parsed = parseSseBlocks(pending);
      pending = parsed.rest;

      for (const block of parsed.blocks) {
        const data = decodeSseData(block);
        if (!data) continue;
        if (data === "[DONE]") {
          continue;
        }

        let payload;
        try {
          payload = JSON.parse(data);
        } catch {
          throw new Error("upstream stream chunk is not valid JSON");
        }

        ensureChunkBase(state, payload);
        const choice = payload?.choices?.[0] ?? {};
        const delta = choice?.delta ?? {};

        if (delta.role === "assistant" && !state.roleSent) {
          emitAndTrack(() => sendRoleChunk(res, state));
        }

        if (typeof delta.content === "string" && delta.content.length > 0) {
          emitAndTrack(() => {
            if (!state.roleSent) sendRoleChunk(res, state);
            consumeContentDelta(res, state, delta.content);
          });
        }

        if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
          emitAndTrack(() => {
            if (!state.roleSent) sendRoleChunk(res, state);
            for (const call of delta.tool_calls) {
              sendToolCallChunk(res, state, {
                id: call.id || `call_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
                function: {
                  name: call.function?.name ?? "",
                  arguments: call.function?.arguments ?? "{}",
                },
              });
            }
            state.markerSeen = true;
          });
        }

        if (choice.finish_reason != null) {
          state.finishReason = choice.finish_reason;
        }
        if (payload?.usage) {
          state.usage = payload.usage;
        }
      }
    }

    pending += decoder.decode();
    const parsedTail = parseSseBlocks(pending);
    for (const block of parsedTail.blocks) {
      const data = decodeSseData(block);
      if (!data || data === "[DONE]") continue;
      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      ensureChunkBase(state, payload);
      const choice = payload?.choices?.[0] ?? {};
      if (choice.finish_reason != null) state.finishReason = choice.finish_reason;
      if (payload?.usage) state.usage = payload.usage;
    }

    if (!state.base) {
      state.base = {
        id: `chatcmpl-adapter-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "unknown-model",
      };
    }

    if (!streamOpened) {
      openStream();
    }
    if (!state.roleSent) {
      markFirstChunk();
      sendRoleChunk(res, state);
    }

    flushBufferedOutput(res, state);
    sendSseData(res, {
      ...state.base,
      choices: [{ index: 0, delta: {}, finish_reason: state.finishReason || "stop" }],
      ...(state.usage ? { usage: state.usage } : {}),
    });
    sendSseDone(res);
    const totalMs = Date.now() - startedAt;
    logInfo(
      `[req=${requestId}] stream_mode=proxy first_chunk_ms=${firstChunkMs < 0 ? totalMs : firstChunkMs} total_ms=${totalMs} fallback_used=false`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!streamOpened && streamFallbackEnabled) {
      logInfo(`[req=${requestId}] stream pre-first-chunk failed, fallback to legacy: ${message}`);
      await handleNonStreamChat(req, res, targetUrl, requestJson, { mode: "fallback", asStream: true });
      const totalMs = Date.now() - startedAt;
      logInfo(`[req=${requestId}] stream_mode=fallback first_chunk_ms=${totalMs} total_ms=${totalMs} fallback_used=true`);
      return;
    }

    if (!streamOpened) {
      res.writeHead(502, {
        "content-type": "application/json; charset=utf-8",
        "x-openclaw-adapter-stream-mode": "proxy",
      });
      res.end(JSON.stringify({ error: { message: `Adapter stream failed: ${message}` } }));
      return;
    }

    try {
      if (!state.base) {
        state.base = {
          id: `chatcmpl-adapter-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "unknown-model",
        };
      }
      if (!state.roleSent) sendRoleChunk(res, state);
      sendSseData(res, {
        ...state.base,
        choices: [{ index: 0, delta: {}, finish_reason: state.finishReason || "stop" }],
        ...(state.usage ? { usage: state.usage } : {}),
      });
      sendSseDone(res);
    } catch {
      try {
        res.end();
      } catch {
        // no-op
      }
    }
    const totalMs = Date.now() - startedAt;
    logInfo(`[req=${requestId}] stream mid-flight failed without fallback: ${message}; total_ms=${totalMs}`);
  }
}

async function handleChatCompletions(req, res, targetUrl, body) {
  let requestJson;
  try {
    requestJson = JSON.parse(body.toString("utf8"));
  } catch {
    res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: { message: "Invalid JSON request body" } }));
    return;
  }

  const wantsStream = Boolean(requestJson?.stream);
  const requestId = randomUUID().replace(/-/g, "").slice(0, 8);
  logDebug(`[req=${requestId}] chat request stream=${wantsStream} stream_mode=${streamMode}`);

  if (wantsStream && streamMode !== "legacy") {
    await handleStreamChat(req, res, targetUrl, requestJson, requestId);
    return;
  }

  await handleNonStreamChat(req, res, targetUrl, requestJson, {
    mode: streamMode === "legacy" ? "legacy" : "proxy",
    asStream: wantsStream,
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const method = (req.method || "GET").toUpperCase();
    const incomingUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const targetUrl = buildTargetUrl(incomingUrl);
    const body = await readRequestBody(req);
    logDebug(`${method} ${incomingUrl.pathname}${incomingUrl.search} -> ${targetUrl.toString()}`);

    if (method === "POST" && incomingUrl.pathname === "/v1/chat/completions") {
      await handleChatCompletions(req, res, targetUrl, body);
      return;
    }

    await forwardRaw(req, res, targetUrl, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error.cause : undefined;
    const causeCode =
      cause && typeof cause === "object" && "code" in cause
        ? String(cause.code ?? "")
        : "";
    const causeMessage =
      cause && typeof cause === "object" && "message" in cause
        ? String(cause.message ?? "")
        : "";
    const detail = [message, causeCode, causeMessage].filter(Boolean).join(" | ");
    logInfo(`request failed: ${detail}`);
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: { message: `Adapter request failed: ${message}` } }));
  }
});

server.listen(port, host, () => {
  logInfo(
    `listening on http://${host}:${port} -> upstream ${upstreamBase}; stream_mode=${streamMode}; stream_fallback=${streamFallbackEnabled}`,
  );
});
