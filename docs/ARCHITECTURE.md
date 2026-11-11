# Enterprise automation architecture

This document outlines the technical design, data lifecycle, and security controls across the workflows in this repository.

## Design principles

Enterprise automation workloads face failure modes that simpler automations can ignore. The workflows in this repository follow three core operational rules:

1. Deterministic data validation: Inputs are validated for type consistency and mathematical integrity before any database mutation or external API request.
2. Stateful human approval gates: Actions involving financial disbursements or outbound sales communications require cryptographic tokens and interactive reviewer confirmation.
3. Grounded retrieval with explicit citations: RAG workflows enforce source citations and fall back to human operators when confidence scores fall below defined quality thresholds.

## Workflow 1: Accounts payable and 3-way matching

### Data flow
Incoming invoice payloads arrive via HTTP POST at `/webhook/invoice-auditor`. The payload can be either structured JSON extracted by OCR or raw document fields.

The workflow calculates line item products (quantity multiplied by unit price) and verifies that the sum of line items matches the stated subtotal within five cents.

Next, it queries `erp.purchase_orders` and `erp.purchase_order_items` in PostgreSQL using the invoice purchase order reference.

### Tolerance thresholds
- Auto-approve: The invoice total must be under $2,000, the vendor tax ID must match the purchase order record, and the variance between the invoice total and the purchase order total must be 0.5% or lower.
- Human review: If the total is $2,000 or greater, or if the variance exceeds 0.5%, the workflow generates an HMAC approval token, writes a pending record to `erp.pending_approvals`, and dispatches an interactive Slack Block Kit card.
- Security alert: If the purchase order reference is missing from PostgreSQL or the vendor tax ID does not match, the invoice is flagged for potential vendor impersonation or fraud.

### Slack callback verification
Reviewers click either `Approve Payment` or `Reject Invoice` in Slack. The callback payload arrives at `/webhook/invoice-approval-callback`. The workflow verifies the request signature, extracts the decision, updates `erp.invoices` and `erp.pending_approvals`, and triggers payment dispatch if approved.

## Workflow 2: Lead enrichment and ICP scoring

### Data flow
Inbound leads arrive at `/webhook/lead-ingest` containing prospect name, email, company, domain, and qualification notes.

The workflow normalizes the domain, gathers company intelligence (headcount tier, industry classification, technology footprint), and applies a 4-pillar scoring rubric:
- Industry fit: Up to 25 points.
- Company size fit: Up to 25 points.
- Tech stack alignment: Up to 25 points.
- Buying intent and operational pain points: Up to 25 points.

### Decision routing
- Score >= 60: The workflow generates three non-generic subject lines, drafts a three-paragraph outreach email referencing company details without marketing buzzwords, stores the prospect in `crm.leads` with status `AWAITING_REVIEW`, and dispatches a Slack review card.
- Score < 60: The prospect is recorded in `crm.leads` with status `DISQUALIFIED` and routed to automated nurture lists.

## Workflow 3: Continuous RAG knowledge ingestion and support

### Ingestion pipeline
Documentation is submitted to `/webhook/rag-ingest`. A markdown chunker parses documents by `#` and `##` headings, creating bounded chunks with section metadata. Vector embeddings (1536 dimensions) are generated and stored in PostgreSQL `rag.document_embeddings` with `pgvector` indexing.

### Query pipeline
Customer inquiries arrive at `/webhook/support-query`. The question is embedded and compared against stored chunks using cosine similarity.

The workflow checks retrieval confidence:
- High confidence (similarity >= 0.70): Synthesizes an answer grounded solely in the retrieved chunks, formatted with citations: `[Source: Document Title - Section]`.
- Low confidence (< 0.70) or escalation keywords: Automatically routes the ticket to senior support in Slack and returns an escalation confirmation.

## Operational security

- All database queries use parameterized SQL `$1, $2, ...` to prevent SQL injection.
- Secret credentials (database passwords, Slack signing secrets, API keys) are supplied via environment variables and never checked into source control.
- PII scrubbing sub-workflows mask personal details (emails, phone numbers, tax IDs, credit cards) before text reaches external LLM inference endpoints.
