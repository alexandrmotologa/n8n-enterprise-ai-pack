# Reusable enterprise sub-workflows

This folder provides reusable sub-workflows designed for cross-cutting operational concerns: incident response alerting, pre-LLM privacy compliance, and transient network failure recovery.

## 1. Universal Slack Error Handler (`error-handler-slack.json`)

Attaches to the n8n Error Trigger. When any workflow encounters an unhandled exception or failed node execution, this sub-workflow triggers automatically:
- Extracts failed node name, error message, execution ID, and workflow metadata.
- Assembles a Slack Block Kit incident alert card containing direct links to the failed run in the n8n execution console.
- Dispatches the alert to `SLACK_WEBHOOK_URL` and records an incident row into `audit.logs` in PostgreSQL.

## 2. PII Masking and Compliance Sanitizer (`pii-masking-helper.json`)

Scans text inputs before transmission to third-party language models or external APIs:
- Identifies and tokens sensitive patterns including email addresses, phone numbers, tax identification numbers, and credit cards.
- Replaces matches with deterministic tokens formatted like `[EMAIL_4a91f0]`.
- Returns sanitized text alongside a token lookup mapping table, allowing callers to unmask responses after generation without exposing customer identifiers to external inference providers.

## 3. Exponential Backoff and Retry Wrapper (`retry-with-backoff.json`)

Wraps transient downstream HTTP requests and API integrations:
- Calculates an exponential backoff schedule with full randomized jitter to avoid stampede effects.
- Configurable maximum retries and initial base delay in milliseconds.
- Catches HTTP 429 rate limits, gateway timeouts, and connection resets, returning structured execution outcomes to calling workflows.
