# Continuous RAG knowledge ingestion and support agent

This workflow coordinates two interconnected pipelines: continuous ingestion of markdown documentation into PostgreSQL with pgvector, and a customer query resolution agent that retrieves matching context chunks, enforces citation formatting, and routes low-confidence or sensitive tickets to human support.

## Architecture

```
Pipeline 1: Continuous Ingestion
Document Ingest Webhook (POST /webhook/rag-ingest)
  -> Semantic Markdown Chunker (Header-based splitting by # and ##)
  -> Generate Vector Embedding (1536-dimensional float vector)
  -> Upsert into pgvector Store (rag.document_embeddings)
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
```

## Knowledge base files

The sample knowledge base in `seed_knowledge_base/` provides production reference documents:
- `enterprise_sla.md`: Uptime guarantees (99.95%), response times (15 minutes for P1), and credit tiers.
- `billing_and_refunds.md`: Invoicing terms, payment windows, and refund criteria.
- `api_rate_limits.md`: Token bucket quotas, burst allowances, and HTTP 429 backoff handling.
- `security_compliance.md`: Encryption standards (AES-256, TLS 1.3), SOC 2 compliance, and data retention windows.

## Example query and response

Request:
```json
{
  "query": "What is our uptime guarantee and response time for P1 outages?",
  "customer_id": "CUST-491",
  "session_id": "SES-8812"
}
```

Response:
```json
{
  "status": "RESOLVED",
  "customer_id": "CUST-491",
  "confidence_score": 0.94,
  "answer": "Our Enterprise SLA guarantees 99.95% monthly uptime with a 15-minute response time for Priority-1 incidents [Source: enterprise_sla.md - Uptime Commitment & P1 Incident Response].",
  "citations": [
    {
      "document": "Enterprise Service Level Agreement (SLA)",
      "section": "Incident response tiers"
    }
  ]
}
```
