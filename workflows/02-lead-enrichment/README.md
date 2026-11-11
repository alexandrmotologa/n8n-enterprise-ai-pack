# Multi-agent B2B lead enrichment and outreach copilot

This workflow qualifies incoming sales leads by gathering domain intelligence, scoring leads against a 4-pillar Ideal Customer Profile (ICP) rubric, generating bespoke outbound drafts for qualified prospects, and posting review cards to Slack with one-click dispatch actions.

## Architecture

```
Lead Ingest Webhook (POST /webhook/lead-ingest)
  -> Sanitize and Normalize Lead Input
  -> Enrich Company Intelligence (Domain, Tech Stack, Size)
  -> Score Lead against ICP Rubric (0 to 100)
     ├── Qualified (Score >= 60)
     │     -> Draft Contextual Outreach Email (3 Subject Lines, 3-Paragraph Body)
     │     -> Build Slack Sales Review Card (Block Kit with Preview)
     │     -> Post Lead Card to Slack
     │     -> Record Lead in PostgreSQL CRM (Status: AWAITING_REVIEW)
     │     -> Dispatch External CRM Sync (HubSpot / Webhook)
     │     -> Respond 200 (Qualified: true)
     └── Disqualified (Score < 60)
           -> Record Disqualified Lead in DB (Status: DISQUALIFIED)
           -> Respond 200 (Qualified: false)
```

## ICP scoring rubric

The scoring engine evaluates prospects across four distinct dimensions with a maximum of 25 points each:

1. Industry Fit (25 pts): Highest scores awarded to B2B SaaS, FinTech, Data Infrastructure, and Cloud Platforms.
2. Company Size Fit (25 pts): Sweet spot centered between 50 and 1,000 employees.
3. Tech Stack Fit (25 pts): Evaluates modern engineering stacks (PostgreSQL, Docker, Kubernetes, orchestration tooling).
4. Buying Signal and Pain Point (25 pts): Evaluates inbound notes for reconciliation bottlenecks, compliance needs, or workflow scale challenges.

Composite score categorization:
- Tier 1: 80 to 100 points (High Priority outreach)
- Tier 2: 60 to 79 points (Medium Priority nurture)
- Tier 3: 0 to 59 points (Disqualified)

## Input schema

```json
{
  "lead_id": "LEAD-2026-901",
  "contact_name": "Sarah Connor",
  "contact_email": "s.connor@datadrive-technologies.io",
  "company_name": "DataDrive Technologies",
  "domain": "datadrive-technologies.io",
  "notes": "Looking for compliance workflow automation across multi-cloud infrastructure."
}
```

## Output response

```json
{
  "status": "SUCCESS",
  "lead_id": "LEAD-2026-901",
  "icp_score": 92,
  "icp_tier": "Tier 1 - High Priority",
  "qualified": true,
  "email_drafted": true,
  "slack_notified": true,
  "message": "Lead enriched, scored above threshold, outreach drafted, and posted for review."
}
```
