.PHONY: help up down test validate seed invoices mock import

help:
	@echo "Available commands:"
	@echo "  make up         Start Docker Compose environment (n8n, postgres, qdrant, mailhog, mock-services)"
	@echo "  make down       Stop Docker Compose environment"
	@echo "  make test       Run schema validator and integration test suite"
	@echo "  make validate   Validate JSON schemas of all n8n workflows"
	@echo "  make seed       Seed PostgreSQL database and vector tables"
	@echo "  make invoices   Generate sample PDF commercial invoices"
	@echo "  make import     Import workflows into running n8n instance"
	@echo "  make mock       Start local mock simulation server"

up:
	docker compose up -d

down:
	docker compose down

test:
	npm test

validate:
	npm run validate

seed:
	npm run seed

invoices:
	npm run generate-invoices

import:
	npm run import

mock:
	npm run mock
