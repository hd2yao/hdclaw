SHELL := /bin/bash
DOCKER_STACK ?= openclaw-fresh
DOCKER_COMPOSE := docker compose -f containers/$(DOCKER_STACK)/docker-compose.yml

.PHONY: bootstrap sync sync-workspace-guards install-skills verify doctor start restart status test-config test-skills test-keyless-search test-tavily-search test-search-router test-no-brave-search test-adapter test-adapter-service test-workspace-guards test-active-task setup-ai-news-daily run-ai-news-daily-now run-web-query test-ai-news-daily docker-build docker-up docker-down docker-shell docker-logs docker-init docker-onboard docker-gateway-start docker-gateway-status docker-fresh-bootstrap

bootstrap:
	bash scripts/bootstrap.sh

sync:
	bash scripts/sync-config.sh
	bash scripts/sync-workspace-guards.sh

install-skills:
	bash scripts/install-skills.sh

verify:
	bash scripts/verify.sh

doctor:
	bash scripts/doctor.sh

start:
	openclaw gateway start

restart:
	openclaw gateway restart

status:
	openclaw gateway status

test-config:
	bash tests/config/validate-config.sh

test-skills:
	bash tests/skills/smoke-test.sh

test-keyless-search:
	bash tests/skills/keyless-search-smoke.sh

test-tavily-search:
	bash tests/skills/tavily-search-smoke.sh

test-search-router:
	bash tests/skills/search-router-order.sh

test-no-brave-search:
	bash tests/skills/no-brave-websearch-regression.sh

test-adapter:
	bash tests/adapter/streaming-smoke.sh
	bash tests/adapter/streaming-contract.sh
	bash tests/adapter/toolcall-transform-stream.sh
	bash tests/adapter/fallback-behavior.sh
	bash tests/adapter/launchd-service-template.sh

test-adapter-service:
	bash tests/adapter/launchd-service-template.sh

test-workspace-guards:
	bash tests/workspace/telegram-execution-guard.sh

test-active-task:
	bash tests/workspace/active-task-script.sh

setup-ai-news-daily:
	bash scripts/setup-ai-news-daily-cron.sh

run-ai-news-daily-now:
	bash scripts/run-ai-news-daily-now.sh

run-web-query:
	bash scripts/agent-web-query.sh "$(QUERY)"

test-ai-news-daily:
	bash tests/config/validate-ai-news-env.sh
	bash tests/skills/ai-news-daily-contract.sh

docker-build:
	$(DOCKER_COMPOSE) build openclaw

docker-up:
	$(DOCKER_COMPOSE) up -d openclaw

docker-down:
	$(DOCKER_COMPOSE) down

docker-shell:
	$(DOCKER_COMPOSE) exec openclaw bash

docker-logs:
	$(DOCKER_COMPOSE) logs -f --tail=200 openclaw

docker-init:
	$(DOCKER_COMPOSE) exec openclaw openclaw-container-init

docker-onboard:
	$(DOCKER_COMPOSE) exec openclaw openclaw onboard

docker-gateway-start:
	$(DOCKER_COMPOSE) exec openclaw sh -lc 'if openclaw gateway health >/dev/null 2>&1; then echo "gateway already healthy"; else nohup openclaw gateway run --allow-unconfigured > $$HOME/.openclaw/gateway.log 2>&1 & sleep 1; openclaw gateway health; fi'

docker-gateway-status:
	$(DOCKER_COMPOSE) exec openclaw sh -lc 'for i in 1 2 3 4 5 6 7 8 9 10; do if openclaw gateway health >/dev/null 2>&1; then openclaw gateway health; exit 0; fi; sleep 1; done; openclaw gateway health'

docker-fresh-bootstrap:
	DOCKER_STACK=$(DOCKER_STACK) OPENCLAW_DASHBOARD_PORT="$(OPENCLAW_DASHBOARD_PORT)" OPENCLAW_TELEGRAM_ALLOW_FROM="$(OPENCLAW_TELEGRAM_ALLOW_FROM)" OPENCLAW_OBSIDIAN_VAULT="$(OPENCLAW_OBSIDIAN_VAULT)" bash scripts/docker-fresh-bootstrap.sh
