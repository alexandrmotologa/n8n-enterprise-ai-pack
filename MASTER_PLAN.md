# n8n Enterprise AI Pack: Architecture and Engineering Master Plan
> Production grade enterprise AI automation blueprints for n8n

## 1. Executive summary

Many published n8n workflow templates are single-step experiments without schema validation, error handling, or human oversight. When an upstream API times out or an LLM returns malformed JSON, these workflows fail silently or perform unintended actions.

n8n-enterprise-ai-pack provides a repository of tested enterprise automation blueprints built around real operational patterns:
1. Three complete enterprise workflows exported as clean, standard n8n JSON templates ready for import.
2. Two reusable sub-workflows for universal error handling and pre-LLM PII sanitization.
3. Interactive Human-in-the-Loop (HITL) approval states with Slack Block Kit cards and cryptographic callback verification.
4. Self-contained local infrastructure with Docker Compose running n8n, PostgreSQL with pgvector, Qdrant, MailHog, and a local mock simulation service for offline end-to-end testing.
5. Automated validation and test runner scripts verifying schemas, database contracts, math tolerances, and retrieval accuracy.

## 2. Core workflow blueprints

### 2.1 Workflow 1: Multimodal Financial Invoice Auditor and Reconciler
File: `workflows/01-invoice-auditor/workflow.json`

Solves Accounts Payable automation, 3-way matching, fraud prevention, and financial compliance.

```
Webhook / File Upload (PDF/Image)
       │
       ▼
Extract Structured Invoice Data (Multimodal LLM / Parser)
       │
       ▼
Validate Invoice Schema and Recalculate Line Sums
       │
       ▼
Query ERP Database (PostgreSQL purchase_orders and items)
       │
       ▼
Evaluate 3-Way Match & Variance
       ├── Match within 0.5% and Total < $2,000 ──► Auto-Approve & Dispatch ERP Payment
       ├── Discrepancy > 0.5% or Total >= $2,000 ──► Generate HMAC Token & Post Slack Block Kit
       └── Missing PO or Tax ID Mismatch ─────────► Flag Security / Fraud Alert
                                                               │
                                                               ▼
                                               Wait for Interactive Slack Callback
                                                               │
                                                               ▼
                                               Verify Signature & Update ERP Status
```

Key characteristics:
- Trigger: Accepts multipart form data with PDF or image invoices, or JSON payload with base64 encoded document.
- Extraction: Extracts vendor name, tax ID, invoice number, date, line items (description, SKU, quantity, unit price, total), tax amount, and total amount.
- ERP cross-reference: Queries PostgreSQL `erp.purchase_orders` and `erp.purchase_order_items`.
- Tolerance engine: Compares line items and order totals. Automatically approves matching orders under $2,000. Escalates variances over 0.5% or invoices over $2,000 to Slack.
- Approval callback: Listens for Slack interactive button callbacks, validates HMAC signatures, updates ERP database records, and logs the decision.

### 2.2 Workflow 2: Multi-Agent B2B Lead Enrichment and Outreach Copilot
File: `workflows/02-lead-enrichment/workflow.json`

Solves lead qualification bottlenecks, data enrichment, and hyper-personalized outbound drafting.

```
Webhook Lead Ingest (Name, Email, Domain, Notes)
       │
       ▼
Input Validation & PII Scrubbing
       │
       ▼
Domain Intelligence Gathering (Web, DNS, Company Meta)
       │
       ▼
Calibrated ICP Scoring Engine (0 to 100 Score across 4 Pillars)
       ├── Score < 60 (Tier 3) ──► Mark Nurture in CRM, Skip Outbound
       └── Score >= 60 (Tier 1 & 2)
              │
              ▼
       Draft Contextual Outreach Email (3 Paragraphs, 3 Subject Lines)
              │
              ▼
       Post Sales Review Card to Slack (#sales-approvals)
              │
              ▼
       Sync Enriched Profile and Status to CRM
```

Key characteristics:
- Trigger: Ingests inbound lead data via webhook.
- Research stage: Analyzes company domain, technology footprint, industry category, and headcount tier.
- ICP scoring: Calibrated rubric evaluating industry fit (25 pts), company size (25 pts), technology stack (25 pts), and operational pain points (25 pts).
- Outreach generation: For leads scoring 70 or higher, drafts a contextual email referencing company facts and pain points without marketing buzzwords.
- Human review: Dispatches a Slack card with lead metrics and a one-click send button, syncing enriched data to `crm.leads`.

### 2.3 Workflow 3: Continuous RAG Knowledge Ingestion and Support Agent
File: `workflows/03-rag-support-copilot/workflow.json`

Solves knowledge drift, ungrounded customer support answers, and escalation management.

```
Ingestion Pipeline:
Document Webhook / Markdown Docs ──► Semantic Header Chunker ──► Embedding Generator ──► Qdrant & pgvector

Support Query Pipeline:
Customer Support Question
       │
       ▼
Vector Similarity Search (Top-3 Chunks from Qdrant / pgvector)
       │
       ▼
Grounded Context Evaluator
       ├── Low Confidence (< 0.75) or Escalation Intent ──► Route to Human Support (Slack / MailHog)
       └── High Confidence (>= 0.75)
              │
              ▼
       Synthesize Answer with Mandatory Citations [Source: Doc - Section]
              │
              ▼
       Return Grounded Response to Customer
```

Key characteristics:
- Ingestion pipeline: Splits markdown documentation by header sections (`#`, `##`, `###`) with sliding token windows, generates embeddings, and writes to Qdrant collection `enterprise_knowledge_base` and PostgreSQL `rag.document_embeddings`.
- Retrievable tool: The support agent retrieves matching context chunks using cosine distance.
- Grounding: Only answers using retrieved evidence. Formats citations with document title and section.
- Fallback and escalation: Automatically routes queries with confidence scores under 0.75 or sensitive intents (billing disputes, account cancellation) to human support.

## 3. Sub-workflows

### 3.1 Universal Slack Error Handler (`sub-workflows/error-handler-slack.json`)
Connects to the n8n Error Trigger. Formats execution ID, failed node, workflow metadata, and error message into an incident card sent to Slack or logged locally.

### 3.2 PII Masking and Compliance Sanitizer (`sub-workflows/pii-masking-helper.json`)
Pre-processes incoming strings before LLM calls. Replaces email addresses, phone numbers, tax IDs, and credit card patterns with deterministic tokens, preserving customer privacy.

## 4. Local execution environment

The project runs locally with Docker Compose:
- n8n: Automation runner with PostgreSQL backend on port 5678.
- postgres: PostgreSQL 16 with pgvector extension on port 5432, pre-seeded with ERP, CRM, and RAG tables.
- qdrant: Vector database on port 6333.
- mailhog: SMTP server on port 1025 and inspection web UI on port 8025.
- mock-services: Local simulation server on port 4000 providing mock Slack webhooks, mock ERP/CRM callbacks, and an offline OpenAI-compatible completion/embedding endpoint.

## 5. Verification and automated testing

The test suite runs with Node.js and PowerShell/Bash:
1. `node scripts/validate_workflows.js`: Verifies JSON schema validity, node IDs, connections, and parameter types across all workflows.
2. `node scripts/seed_databases.js`: Initializes database tables and indexes sample markdown knowledge articles into Qdrant and pgvector.
3. `node scripts/test_all.js`: Simulates end-to-end webhook calls for all three workflows and both sub-workflows, asserting correct branching, tolerance checks, and citation outputs.
4. `.github/workflows/validate-workflows.yml`: GitHub Actions CI pipeline executing schema checks and unit assertions on every pull request.
