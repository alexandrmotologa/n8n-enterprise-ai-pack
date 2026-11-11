# n8n Enterprise AI Pack

Production grade enterprise automation templates for n8n. This repository contains three flagship workflows, two operational sub-workflows, database schemas with pgvector, and a local Docker environment with a mock simulation server for offline execution.

## Workflows overview

### 1. Multimodal financial invoice auditor and reconciler
Location: `workflows/01-invoice-auditor/`

Performs accounts payable automation with 3-way matching and Slack approval gates:
- Validates invoice line items, tax calculations, and subtotal consistency.
- Queries PostgreSQL purchase orders (`erp.purchase_orders` and `erp.purchase_order_items`).
- Automatically approves orders under $2,000 with variance below 0.5%.
- Generates HMAC approval tokens and Slack Block Kit cards for orders above $2,000 or variances exceeding 0.5%.
- Listens for interactive callback webhooks (`POST /webhook/invoice-approval-callback`), verifies signatures, and updates ERP database records.

### 2. Multi-agent B2B lead enrichment and outreach copilot
Location: `workflows/02-lead-enrichment/`

Automates sales qualification and outbound email drafting:
- Ingests inbound leads via webhook (`POST /webhook/lead-ingest`).
- Normalizes domains and gathers company infrastructure profiles.
- Evaluates leads against a 4-pillar ICP scoring rubric (Industry, Team Size, Tech Stack, Pain Points) from 0 to 100.
- Drafts contextual three-paragraph emails and three subject lines for leads scoring 60 or higher.
- Posts review cards to `#sales-approvals` in Slack with one-click dispatch actions, syncing enriched records to `crm.leads`.

### 3. Continuous RAG knowledge ingestion and support agent
Location: `workflows/03-rag-support-copilot/`

Provides continuous documentation indexing and grounded customer support:
- Ingestion pipeline (`POST /webhook/rag-ingest`) chunks markdown documents by header sections (`#`, `##`), generates 1536-dimensional embeddings, and writes to PostgreSQL `rag.document_embeddings` with pgvector.
- Support query pipeline (`POST /webhook/support-query`) runs vector similarity searches to retrieve the top 3 relevant sections.
- Evaluates retrieval confidence: queries scoring below 0.70 or containing account dispute keywords route directly to tier-2 support in Slack.
- Grounded responses enforce source citations in the format `[Source: Document - Section]`.

### Operational sub-workflows
Location: `sub-workflows/`

- `error-handler-slack.json`: Attaches to the n8n Error Trigger, formats execution failure details into a Slack Block Kit incident card with direct links to the n8n run, and logs incidents to PostgreSQL `audit.logs`.
- `pii-masking-helper.json`: Scrubs email addresses, phone numbers, tax identification numbers, and credit cards before text reaches external language models.

## Local environment setup

The environment runs locally with Docker Compose:

```bash
# Clone the repository
git clone https://github.com/alexandrmotologa/n8n-enterprise-ai-pack.git
cd n8n-enterprise-ai-pack

# Copy sample environment configuration
cp .env.example .env

# Start all containers
docker compose up -d
```

### Services and ports

- n8n: `http://localhost:5678`
- PostgreSQL with pgvector: `localhost:5432` (database: `n8n`, user: `n8n`)
- Qdrant Vector DB: `http://localhost:6333`
- MailHog UI: `http://localhost:8025` (SMTP on `1025`)
- Mock Simulation Server: `http://localhost:4000`

## Automated test suite

Run the test suite to validate workflow JSON schemas, math tolerance calculations, Slack Block Kit generation, and retrieval logic:

```bash
# Install dependencies
npm install

# Run schema validation and full test runner
npm test
```

On Windows with PowerShell:
```powershell
.\scripts\test_all.ps1
```

On Linux or macOS:
```bash
./scripts/test_all.sh
```

## Repository structure

```
n8n-enterprise-ai-pack/
├── .github/workflows/
│   └── validate-workflows.yml
├── docs/
│   └── ARCHITECTURE.md
├── init-db/
│   └── 01-init.sql
├── mock-services/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── scripts/
│   ├── generate_sample_invoices.js
│   ├── seed_databases.js
│   ├── test_all.js
│   ├── test_all.ps1
│   ├── test_all.sh
│   └── validate_workflows.js
├── sub-workflows/
│   ├── README.md
│   ├── error-handler-slack.json
│   └── pii-masking-helper.json
├── workflows/
│   ├── 01-invoice-auditor/
│   │   ├── README.md
│   │   ├── mock_invoice_clean.pdf
│   │   ├── mock_invoice_discrepancy.pdf
│   │   ├── mock_invoice_high_value.pdf
│   │   ├── mock_po_data.sql
│   │   ├── sample_invoice.json
│   │   ├── sample_invoice_discrepancy.json
│   │   └── workflow.json
│   ├── 02-lead-enrichment/
│   │   ├── README.md
│   │   ├── high_icp_lead.json
│   │   ├── low_icp_lead.json
│   │   ├── sample_webhook_payload.json
│   │   └── workflow.json
│   └── 03-rag-support-copilot/
│       ├── README.md
│       ├── seed_knowledge_base/
│       └── workflow.json
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Makefile
├── MASTER_PLAN.md
├── package.json
└── README.md
```
