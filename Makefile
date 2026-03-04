SHELL := /bin/bash

.PHONY: bootstrap sync install-skills verify doctor start restart status test-config test-skills test-adapter setup-ai-news-daily run-ai-news-daily-now test-ai-news-daily

bootstrap:
	bash scripts/bootstrap.sh

sync:
	bash scripts/sync-config.sh

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

test-adapter:
	bash tests/adapter/streaming-smoke.sh
	bash tests/adapter/streaming-contract.sh
	bash tests/adapter/toolcall-transform-stream.sh
	bash tests/adapter/fallback-behavior.sh

setup-ai-news-daily:
	bash scripts/setup-ai-news-daily-cron.sh

run-ai-news-daily-now:
	bash scripts/run-ai-news-daily-now.sh

test-ai-news-daily:
	bash tests/config/validate-ai-news-env.sh
	bash tests/skills/ai-news-daily-contract.sh
