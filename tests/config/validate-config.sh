#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

TARGET="$TMP_DIR/openclaw.json"
BACKUP_DIR="$TMP_DIR/backup"
ENV_BAD="$TMP_DIR/.env.bad"
ENV_OK="$TMP_DIR/.env.ok"
ENV_LOCAL="$TMP_DIR/.env.local-model"
ENV_LOCAL_ADAPTER="$TMP_DIR/.env.local-adapter"
ENV_INVALID="$TMP_DIR/.env.invalid"
ENV_WEB_BRAVE="$TMP_DIR/.env.web.brave"

cat > "$ENV_BAD" <<'EOB'
CLAWRA_IMAGE_PROVIDER=fal
CLAWRA_IMAGE_MODEL=gpt-image-1
EOB

cat > "$ENV_OK" <<'EOG'
CLAWRA_IMAGE_PROVIDER=fal
CLAWRA_IMAGE_MODEL=gpt-image-1
OPENAI_API_KEY=test-openai-key
FAL_KEY=test-fal-key
CLAWRA_REFERENCE_IMAGE=https://example.com/clawra.png
CLAWRA_SELFIE_MODE=auto
CLAWRA_USE_REFERENCE_IMAGE=true
OPENCLAW_OPENAI_MODEL_PARAMS_JSON='{"tools":[{"type":"web_search_preview"}]}'
OPENCLAW_THINKING_DEFAULT=off
OPENCLAW_TELEGRAM_STREAM_MODE=off
EOG

cat > "$ENV_LOCAL" <<'EOL'
CLAWRA_IMAGE_PROVIDER=fal
CLAWRA_IMAGE_MODEL=gpt-image-1
OPENAI_API_KEY=test-openai-key
FAL_KEY=test-fal-key
CLAWRA_REFERENCE_IMAGE=https://example.com/clawra.png
CLAWRA_SELFIE_MODE=auto
CLAWRA_USE_REFERENCE_IMAGE=true
OPENCLAW_LLM_MODE=local
OPENCLAW_LOCAL_PROVIDER=vllm
OPENCLAW_LOCAL_MODEL_ID=/data/qwen3.5-27b
OPENCLAW_LOCAL_MODEL_NAME=Qwen-3.5-27B
OPENCLAW_LOCAL_BASE_URL=http://192.168.6.230/v1
OPENCLAW_LOCAL_API=openai-completions
OPENCLAW_LOCAL_API_KEY=local-noauth
OPENCLAW_LOCAL_CONTEXT_WINDOW=131072
OPENCLAW_LOCAL_MAX_TOKENS=8192
OPENCLAW_LOCAL_REASONING=true
OPENCLAW_LOCAL_MODEL_PARAMS_JSON='{"chat_template_kwargs":{"enable_thinking":false}}'
EOL

cat > "$ENV_WEB_BRAVE" <<'EOW'
CLAWRA_IMAGE_PROVIDER=fal
CLAWRA_IMAGE_MODEL=gpt-image-1
OPENAI_API_KEY=test-openai-key
FAL_KEY=test-fal-key
CLAWRA_REFERENCE_IMAGE=https://example.com/clawra.png
CLAWRA_SELFIE_MODE=auto
CLAWRA_USE_REFERENCE_IMAGE=true
OPENCLAW_WEB_SEARCH_MODE=brave
OPENCLAW_WEB_SEARCH_API_KEY=test-brave-key
TAVILY_API_KEY=test-tavily-key
EOW

cat > "$ENV_INVALID" <<'EOI'
CLAWRA_IMAGE_PROVIDER=fal
CLAWRA_IMAGE_MODEL=gpt-image-1
OPENAI_API_KEY=test-openai-key
FAL_KEY=test-fal-key
CLAWRA_REFERENCE_IMAGE=https://example.com/clawra.png
CLAWRA_SELFIE_MODE=auto
CLAWRA_USE_REFERENCE_IMAGE=true
OPENCLAW_LLM_MODE=invalid-mode
EOI

cat > "$ENV_LOCAL_ADAPTER" <<'EOA'
CLAWRA_IMAGE_PROVIDER=fal
CLAWRA_IMAGE_MODEL=gpt-image-1
OPENAI_API_KEY=test-openai-key
FAL_KEY=test-fal-key
CLAWRA_REFERENCE_IMAGE=https://example.com/clawra.png
CLAWRA_SELFIE_MODE=auto
CLAWRA_USE_REFERENCE_IMAGE=true
OPENCLAW_LLM_MODE=local
OPENCLAW_LOCAL_PROVIDER=local
OPENCLAW_LOCAL_MODEL_ID=/data/qwen3.5-27b
OPENCLAW_LOCAL_MODEL_NAME=Qwen-3.5-27B
OPENCLAW_LOCAL_BASE_URL=http://192.168.6.230:30000/v1
OPENCLAW_LOCAL_API=openai-completions
OPENCLAW_LOCAL_API_KEY=local-noauth
OPENCLAW_LOCAL_CONTEXT_WINDOW=32768
OPENCLAW_LOCAL_MAX_TOKENS=8192
OPENCLAW_LOCAL_REASONING=false
OPENCLAW_LOCAL_TOOLCALL_ADAPTER=sglang
OPENCLAW_LOCAL_TOOLCALL_ADAPTER_BASE_URL=http://127.0.0.1:31001/v1
EOA

echo "[test-config] case1: missing env should fail"
if OPENCLAW_ENV_FILE="$ENV_BAD" OPENCLAW_CONFIG_TARGET="$TARGET" OPENCLAW_BACKUP_DIR="$BACKUP_DIR" \
  bash "$ROOT_DIR/scripts/sync-config.sh" >/dev/null 2>&1; then
  echo "[test-config] expected failure but got success" >&2
  exit 1
fi

echo "[test-config] case2: full env should pass"
cat > "$TARGET" <<'EOC'
{
  "channels": {
    "telegram": {
      "enabled": true,
      "streamMode": "partial"
    }
  }
}
EOC

OPENCLAW_ENV_FILE="$ENV_OK" OPENCLAW_CONFIG_TARGET="$TARGET" OPENCLAW_BACKUP_DIR="$BACKUP_DIR" \
  bash "$ROOT_DIR/scripts/sync-config.sh" >/dev/null

[[ -f "$TARGET" ]] || { echo "[test-config] target not created" >&2; exit 1; }

jq -er '.agents.defaults.model.primary == "openai-codex/gpt-5.3-codex"' "$TARGET" >/dev/null || {
  echo "[test-config] expected default openai-codex primary model" >&2
  exit 1
}

jq -er '.agents.defaults.models["openai-codex/gpt-5.3-codex"].params.tools[0].type == "web_search_preview"' "$TARGET" >/dev/null || {
  echo "[test-config] expected openai model params to be injected" >&2
  exit 1
}

jq -er '.agents.defaults.thinkingDefault == "off"' "$TARGET" >/dev/null || {
  echo "[test-config] expected thinkingDefault off" >&2
  exit 1
}

jq -er '.tools.web.search.enabled == false' "$TARGET" >/dev/null || {
  echo "[test-config] expected web_search disabled when no API key is configured" >&2
  exit 1
}

jq -er '.channels.telegram.streamMode == "off"' "$TARGET" >/dev/null || {
  echo "[test-config] expected telegram streamMode override to off" >&2
  exit 1
}

jq -er '.skills.entries["tavily-search"].enabled == true' "$TARGET" >/dev/null || {
  echo "[test-config] expected tavily-search enabled from catalog" >&2
  exit 1
}

jq -er '.skills.entries["tavily-search"].env.TAVILY_API_KEY == ""' "$TARGET" >/dev/null || {
  echo "[test-config] expected optional tavily key to render empty string when unset" >&2
  exit 1
}

sum1="$(shasum "$TARGET" | awk '{print $1}')"
OPENCLAW_ENV_FILE="$ENV_OK" OPENCLAW_CONFIG_TARGET="$TARGET" OPENCLAW_BACKUP_DIR="$BACKUP_DIR" \
  bash "$ROOT_DIR/scripts/sync-config.sh" >/dev/null
sum2="$(shasum "$TARGET" | awk '{print $1}')"

if [[ "$sum1" != "$sum2" ]]; then
  echo "[test-config] config is not idempotent" >&2
  exit 1
fi

echo "[test-config] case3: local mode should pass and set local provider"
OPENCLAW_ENV_FILE="$ENV_LOCAL" OPENCLAW_CONFIG_TARGET="$TARGET" OPENCLAW_BACKUP_DIR="$BACKUP_DIR" \
  bash "$ROOT_DIR/scripts/sync-config.sh" >/dev/null

jq -er '.agents.defaults.model.primary == "vllm//data/qwen3.5-27b"' "$TARGET" >/dev/null || {
  echo "[test-config] expected local primary model key" >&2
  exit 1
}

jq -er '.models.providers.vllm.baseUrl == "http://192.168.6.230/v1"' "$TARGET" >/dev/null || {
  echo "[test-config] expected local provider baseUrl" >&2
  exit 1
}

jq -er '.models.providers.vllm.api == "openai-completions"' "$TARGET" >/dev/null || {
  echo "[test-config] expected local provider api openai-completions" >&2
  exit 1
}

jq -er '.models.providers.vllm.models[0].id == "/data/qwen3.5-27b"' "$TARGET" >/dev/null || {
  echo "[test-config] expected local provider model id" >&2
  exit 1
}

jq -er '.agents.defaults.models["vllm//data/qwen3.5-27b"].params.chat_template_kwargs.enable_thinking == false' "$TARGET" >/dev/null || {
  echo "[test-config] expected local model params to be injected" >&2
  exit 1
}

jq -er '.tools.web.search.enabled == false' "$TARGET" >/dev/null || {
  echo "[test-config] expected web_search disabled in local mode without key" >&2
  exit 1
}

echo "[test-config] case4: local adapter mode should override baseUrl and disable memory flush by default"
OPENCLAW_ENV_FILE="$ENV_LOCAL_ADAPTER" OPENCLAW_CONFIG_TARGET="$TARGET" OPENCLAW_BACKUP_DIR="$BACKUP_DIR" \
  bash "$ROOT_DIR/scripts/sync-config.sh" >/dev/null

jq -er '.agents.defaults.model.primary == "local//data/qwen3.5-27b"' "$TARGET" >/dev/null || {
  echo "[test-config] expected local primary model key for adapter mode" >&2
  exit 1
}

jq -er '.models.providers.local.baseUrl == "http://127.0.0.1:31001/v1"' "$TARGET" >/dev/null || {
  echo "[test-config] expected adapter baseUrl override" >&2
  exit 1
}

jq -er '.agents.defaults.compaction.memoryFlush.enabled == false' "$TARGET" >/dev/null || {
  echo "[test-config] expected memory flush disabled by default in adapter mode" >&2
  exit 1
}

jq -er '.tools.web.search.enabled == false' "$TARGET" >/dev/null || {
  echo "[test-config] expected web_search disabled in adapter mode without key" >&2
  exit 1
}

echo "[test-config] case5: explicit brave mode with key should enable web_search"
OPENCLAW_ENV_FILE="$ENV_WEB_BRAVE" OPENCLAW_CONFIG_TARGET="$TARGET" OPENCLAW_BACKUP_DIR="$BACKUP_DIR" \
  bash "$ROOT_DIR/scripts/sync-config.sh" >/dev/null

jq -er '.tools.web.search.enabled == true' "$TARGET" >/dev/null || {
  echo "[test-config] expected web_search enabled in brave mode with key" >&2
  exit 1
}

jq -er '.tools.web.search.provider == "brave"' "$TARGET" >/dev/null || {
  echo "[test-config] expected web_search provider to be brave" >&2
  exit 1
}

jq -er '.tools.web.search.apiKey == "test-brave-key"' "$TARGET" >/dev/null || {
  echo "[test-config] expected web_search apiKey from OPENCLAW_WEB_SEARCH_API_KEY" >&2
  exit 1
}

jq -er '.skills.entries["tavily-search"].env.TAVILY_API_KEY == "test-tavily-key"' "$TARGET" >/dev/null || {
  echo "[test-config] expected optional tavily key to render configured value" >&2
  exit 1
}

echo "[test-config] case6: switching to disabled web_search should keep provider string and clear apiKey"
OPENCLAW_ENV_FILE="$ENV_OK" OPENCLAW_CONFIG_TARGET="$TARGET" OPENCLAW_BACKUP_DIR="$BACKUP_DIR" \
  bash "$ROOT_DIR/scripts/sync-config.sh" >/dev/null

jq -er '.tools.web.search.enabled == false' "$TARGET" >/dev/null || {
  echo "[test-config] expected web_search disabled after switching off brave mode" >&2
  exit 1
}

jq -er '.tools.web.search.provider == "brave"' "$TARGET" >/dev/null || {
  echo "[test-config] expected web_search provider to remain brave for schema compatibility when disabled" >&2
  exit 1
}

jq -er '.tools.web.search.apiKey == ""' "$TARGET" >/dev/null || {
  echo "[test-config] expected web_search apiKey to be empty string when disabled" >&2
  exit 1
}

echo "[test-config] case7: invalid llm mode should fail"
if OPENCLAW_ENV_FILE="$ENV_INVALID" OPENCLAW_CONFIG_TARGET="$TARGET" OPENCLAW_BACKUP_DIR="$BACKUP_DIR" \
  bash "$ROOT_DIR/scripts/sync-config.sh" >/dev/null 2>&1; then
  echo "[test-config] expected invalid llm mode failure but got success" >&2
  exit 1
fi

echo "[test-config] passed"
