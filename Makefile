SHELL := /bin/bash

.PHONY: bootstrap sync install-skills verify doctor start restart status test-config test-skills

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
