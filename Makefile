# Local Docker development helpers (docker-compose.yml, docs/docker.md).
# Production does not use Docker: see deploy/ovh/README.md.

COMPOSE ?= docker compose
ARGS ?=
SMOKE ?= core website accounts

.PHONY: help up down logs ps shell psql seed test test-smoke build build-frontend config clean

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-15s %s\n", $$1, $$2}'

up: ## Build and start db + backend + frontend in the background
	$(COMPOSE) up -d --build
	@echo "API:      http://localhost:$${BACKEND_PORT:-8000}/api/health/"
	@echo "Frontend: http://localhost:$${FRONTEND_PORT:-3000}/"

down: ## Stop the stack (data volumes are kept; see `make clean`)
	$(COMPOSE) down

logs: ## Follow the logs (console email shows up here)
	$(COMPOSE) logs -f --tail=200

ps: ## Show the services and their health
	$(COMPOSE) ps

shell: ## Bash inside the backend container
	$(COMPOSE) exec backend bash

psql: ## psql on the local database
	$(COMPOSE) exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

seed: ## Demo company + owner (random password printed once)
	$(COMPOSE) run --rm seed

test: ## Backend tests on Postgres 16, e.g. make test ARGS="core website accounts"
	$(COMPOSE) run --rm test pytest -q $(ARGS)

test-smoke: ## The quick subset: core website accounts
	$(COMPOSE) run --rm test pytest -q $(SMOKE)

build: ## Build the images without starting anything
	$(COMPOSE) build backend frontend

build-frontend: ## npm run build -> frontend/out (the export Django serves)
	$(COMPOSE) run --rm frontend-build

config: ## Validate docker-compose.yml
	$(COMPOSE) config --quiet && echo "docker-compose.yml is valid"

clean: ## Stop and DELETE the local database and media volumes
	$(COMPOSE) down -v
