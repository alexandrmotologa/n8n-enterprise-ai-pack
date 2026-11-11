# Multimodal invoice auditor and 3-way reconciliation

This workflow automates accounts payable reconciliation by comparing incoming invoices against purchase orders stored in PostgreSQL. It evaluates item totals, validates individual line-item SKUs, calculates variances, automatically approves invoices within safe tolerances, rejects duplicates, and routes high-value or disputed invoices to Slack for human signoff.

## Architecture

```
Webhook Trigger (Invoice Payload or PDF)
  -> Normalize and Validate Invoice Math
  -> Fetch Purchase Order from PostgreSQL (checks duplicate status)
  -> Evaluate 3-Way Match, SKU Discrepancies, and Variance
     ├── Duplicate Invoice -> Short-circuit with DUPLICATE_REJECTED
     ├── Tax ID Mismatch or Missing PO -> Security Alert
     ├── Within tolerance (<= 0.5% default) and total < $2,000 -> Auto-Approve -> Dispatch ERP Payment -> Update DB -> Respond 200
     └── Exceeds tolerance, total >= $2,000, or SKU mismatch -> Generate Token with Expiration -> Store Pending DB -> Post to Slack
  
Slack Callback Webhook
  -> Parse Approver Action, Token, and Expiration Timestamp
  ├── Token Expired -> Mark Status EXPIRED and Block Payment
  └── Valid Signature & Active Token -> Update Database Status (MANUALLY_APPROVED / REJECTED) -> Return Callback Confirmation
```

## Security and fraud controls

- Duplicate prevention: Before running reconciliation logic, checks if the `invoice_number` has already been recorded in `erp.invoices` with status `AUTO_APPROVED`, `MANUALLY_APPROVED`, or `PAID`. Reprocessing attempts are rejected immediately.
- Line-item verification: Matches each invoiced SKU against corresponding items in the purchase order. Mismatched quantities or unapproved unit prices trigger mandatory human review regardless of whether the aggregate total matches.
- Token expiration: Approval tokens embedded in Slack buttons carry an explicit 48-hour expiration window. Approvals attempted past this window are rejected and marked as `EXPIRED`.
- Configurable thresholds: Operators can tune tolerance parameters via `INVOICE_VARIANCE_THRESHOLD_PCT` (default `0.5%`) and `INVOICE_HITL_AMOUNT_THRESHOLD` (default `$2000`).

## Data contract

```json
{
  "vendor_name": "Acme Cloud Solutions LLC",
  "vendor_tax_id": "US-94281901",
  "invoice_number": "INV-2026-0012",
  "invoice_date": "2026-11-11",
  "po_reference": "PO-2026-001",
  "currency": "USD",
  "line_items": [
    {
      "sku": "CLOUD-SUB-M",
      "description": "Monthly Cloud Hosting Tier M",
      "quantity": 1,
      "unit_price": 1000.00,
      "total_price": 1000.00
    }
  ],
  "subtotal": 1000.00,
  "tax_amount": 80.00,
  "total_amount": 1080.00
}
```

## Testing scenarios

- Clean Auto-Approve: Use `mock_invoice_clean.pdf` or `sample_invoice.json`. Matches `PO-2026-001`. Total is $1,620.00 (under $2,000 threshold), variance is 0%.
- High-Value Approval: Matches `PO-2026-002`. Total is $12,960.00. Because the amount exceeds $2,000, it triggers an interactive Slack card.
- Variance Discrepancy: Matches `PO-2026-003`. Invoice amount has a 5% difference compared to PO. Triggers a variance alert in Slack.
- Tax ID Mismatch / Fraud: Matches `PO-2026-004` but presents a conflicting vendor tax ID. Flags a security alert immediately.
- Duplicate Rejection: Submitting an invoice number that is already approved returns `DUPLICATE_REJECTED`.
- Expired Token: An interactive approval callback submitted with a past expiration timestamp updates the record to `EXPIRED`.
