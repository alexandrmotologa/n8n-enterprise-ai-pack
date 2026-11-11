# Multimodal invoice auditor and 3-way reconciliation

This workflow automates accounts payable reconciliation by comparing incoming invoices against purchase orders stored in PostgreSQL. It evaluates item totals, calculates variances, automatically approves invoices within safe tolerances, and routes high-value or disputed invoices to Slack for human signoff.

## Architecture

```
Webhook Trigger (Invoice Payload or PDF)
  -> Normalize and Validate Invoice Math
  -> Fetch Purchase Order from PostgreSQL
  -> Evaluate 3-Way Match and Variance
     ├── Within 0.5% tolerance and total < $2,000 -> Auto-Approve -> Dispatch ERP Payment -> Update DB -> Respond 200
     └── Exceeds 0.5% variance or total >= $2,000 -> Generate Token & Slack Block Kit -> Store Pending DB -> Post to Slack
  
Slack Callback Webhook
  -> Parse Approver Action and Token
  -> Update Database Status (MANUALLY_APPROVED / REJECTED)
  -> Return Callback Confirmation
```

## Node inventory

1. Invoice Webhook Trigger (`POST /webhook/invoice-auditor`): Accepts incoming JSON invoice records or structured extraction outputs.
2. Normalize and Validate Invoice Math: Verifies that quantity multiplied by unit price matches line totals, sums line items, and tests math consistency within 5 cents.
3. Fetch PO from PostgreSQL: Queries `erp.purchase_orders` and `erp.purchase_order_items` matching `po_reference`.
4. Evaluate 3-Way Match & Variance: Checks vendor tax ID match. Compares invoice total against purchase order total. Determines whether the invoice meets auto-approval rules.
5. Is Auto-Approved? (IF Router): Directs execution between instant settlement and Slack review.
6. Dispatch ERP Payment: Issues an HTTP POST to the ERP payment webhook.
7. Record Approved Invoice in DB: Updates `erp.invoices` table with status `AUTO_APPROVED`.
8. Build Slack Block Kit & Token: Generates a cryptographically random token and constructs an interactive Slack message card containing invoice lines, PO comparison, and action buttons.
9. Store Pending Approval in DB: Saves the pending approval record to `erp.pending_approvals`.
10. Post Interactive Card to Slack: Sends the Block Kit payload to `SLACK_WEBHOOK_URL`.
11. Slack Interactive Callback Webhook (`POST /webhook/invoice-approval-callback`): Receives button clicks from Slack.
12. Parse Slack Callback Action: Identifies whether the reviewer approved or rejected the invoice.
13. Update Invoice Status Post-Approval: Updates `erp.invoices` and marks `erp.pending_approvals` complete.

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
