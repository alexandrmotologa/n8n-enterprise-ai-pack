# Continuous RAG knowledge ingestion and support agent

This workflow coordinates three interconnected capabilities: continuous ingestion of markdown documentation into PostgreSQL with pgvector, a customer query resolution agent with citations and human escalation gates, and an ongoing feedback loop for retrieval optimization.

## Architecture

```
Pipeline 1: Continuous Ingestion
Document Ingest Webhook (POST /webhook/rag-ingest)
  -> Semantic Markdown Chunker (Header-based splitting by # and ##)
  -> Generate Vector Embedding (1536-dimensional float vector)
  -> Upsert into pgvector Store with Deduplication (ON CONFLICT DO UPDATE)
  -> Respond 200 (Total chunks indexed)

Pipeline 2: Grounded Support Query
Support Query Webhook Trigger (POST /webhook/support-query)
  -> Embed User Question
  -> Retrieve Top Context Chunks (Cosine similarity search LIMIT 3)
  -> Evaluate Grounding & Confidence
     ├── Low Confidence (< 0.70) or Escalation Keyword
     │     -> Alert Tier-2 Support in Slack
     │     -> Respond 200 (Status: ESCALATED_TO_HUMAN)
     └── High Confidence (>= 0.70)
           -> Generate Grounded Answer with Citations (Format: [Source: Doc - Section])
           -> Respond 200 (Status: RESOLVED)

Pipeline 3: Retrieval Quality Feedback
Feedback Webhook Trigger (POST /webhook/rag-feedback)
  -> Record User Rating (HELPFUL / NOT_HELPFUL) in rag.query_feedback
  -> Return 200 Confirmation
```

## Ingestion deduplication

To prevent duplicate chunks when documentation is republished, the pgvector table enforces `CONSTRAINT uq_doc_chunk UNIQUE (doc_id, chunk_index)`. Re-ingesting an updated version of `enterprise_sla.md` updates the existing embedding vectors in place rather than creating redundant database rows.

## Knowledge base files

The sample knowledge base in `seed_knowledge_base/` provides production reference documents:
- `enterprise_sla.md`: Uptime guarantees (99.95%), response times (15 minutes for P1), and credit tiers.
- `billing_and_refunds.md`: Invoicing terms, payment windows, and refund criteria.
- `api_rate_limits.md`: Token bucket quotas, burst allowances, and HTTP 429 backoff handling.
- `security_compliance.md`: Encryption standards (AES-256, TLS 1.3), SOC 2 compliance, and data retention windows.

## Retrieval feedback contract

Request:
```json
{
  "session_id": "SES-8812",
  "customer_id": "CUST-491",
  "query": "What is our uptime guarantee?",
  "answer": "Our Enterprise SLA guarantees 99.95% monthly uptime.",
  "rating": "HELPFUL",
  "comment": "Accurate response with exact citation."
}
```

Response:
```json
{
  "status": "SUCCESS",
  "message": "User retrieval feedback recorded successfully for RAG optimization."
}
```
