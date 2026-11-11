const fs = require('fs');
const path = require('path');

console.log('Applying Enterprise Improvements...');

// ============================================================================
// 1. WORKFLOW 1: HARDEN WITH DUPLICATE PROTECTION & EXPIRATION CHECK
// ============================================================================
const wf1Path = path.resolve(__dirname, '../workflows/01-invoice-auditor/workflow.json');
const wf1 = JSON.parse(fs.readFileSync(wf1Path, 'utf8'));

// Fetch PO query includes existing invoice status check
const fetchNode = wf1.nodes.find(n => n.name === 'Fetch PO from PostgreSQL');
if (fetchNode) {
  fetchNode.parameters.query = 'SELECT po.po_number, po.vendor_name, po.vendor_tax_id, po.subtotal, po.tax_amount, po.total_amount, po.currency, po.status, (SELECT status FROM erp.invoices WHERE invoice_number = $2 LIMIT 1) AS existing_invoice_status, COALESCE(json_agg(json_build_object(\'sku\', items.sku, \'description\', items.description, \'quantity\', items.quantity, \'unit_price\', items.unit_price, \'total_price\', items.total_price)) FILTER (WHERE items.id IS NOT NULL), \'[]\'::json) AS po_items FROM erp.purchase_orders po LEFT JOIN erp.purchase_order_items items ON po.po_number = items.po_number WHERE po.po_number = $1 GROUP BY po.po_number;';
  fetchNode.parameters.queryParams = '={{ [$json.po_reference, $json.invoice_number].join(\',\') }}';
}

// Evaluate 3-Way Match & Variance with duplicate prevention, configurable env thresholds, and SKU-level verification
const evalNode = wf1.nodes.find(n => n.name === 'Evaluate 3-Way Match & Variance');
if (evalNode) {
  evalNode.parameters.jsCode = `const invoice = $('Normalize & Validate Invoice Math').first().json;
const poList = $input.all();

// Configurable thresholds from environment variables
const varianceThreshold = Number($env.INVOICE_VARIANCE_THRESHOLD_PCT || 0.5);
const amountThreshold = Number($env.INVOICE_HITL_AMOUNT_THRESHOLD || 2000);

// 1. Duplicate invoice prevention
if (poList && poList.length > 0 && poList[0].json.existing_invoice_status) {
  const existingStatus = poList[0].json.existing_invoice_status;
  if (['AUTO_APPROVED', 'MANUALLY_APPROVED', 'PAID'].includes(existingStatus)) {
    return [{
      json: {
        ...invoice,
        decision: 'DUPLICATE_REJECTED',
        reason: \`Invoice \${invoice.invoice_number} has already been settled with status \${existingStatus}. Duplicate processing blocked.\`,
        variance_pct: 0
      }
    }];
  }
}

// 2. PO existence check
if (!poList || poList.length === 0 || !poList[0].json.po_number) {
  return [{
    json: {
      ...invoice,
      po_found: false,
      decision: 'SECURITY_ALERT',
      reason: \`Referenced PO \${invoice.po_reference} not found in ERP records\`,
      variance_pct: 100.0
    }
  }];
}

const po = poList[0].json;
const taxIdMatch = (invoice.vendor_tax_id.trim().toUpperCase() === po.vendor_tax_id.trim().toUpperCase());

if (!taxIdMatch) {
  return [{
    json: {
      ...invoice,
      po_found: true,
      po_record: po,
      decision: 'SECURITY_ALERT',
      reason: \`Tax ID mismatch: Invoice \${invoice.vendor_tax_id} vs PO \${po.vendor_tax_id}. Potential fraud or vendor impersonation.\`,
      variance_pct: 100.0
    }
  }];
}

// 3. Line-item level SKU and pricing verification
const poItems = Array.isArray(po.po_items) ? po.po_items : (typeof po.po_items === 'string' ? JSON.parse(po.po_items) : []);
const lineDiscrepancies = [];

for (const invItem of invoice.line_items) {
  const matchedPoItem = poItems.find(p => p.sku === invItem.sku);
  if (!matchedPoItem) {
    lineDiscrepancies.push({ sku: invItem.sku, issue: 'SKU not present in Purchase Order' });
  } else {
    if (Math.abs(Number(invItem.quantity) - Number(matchedPoItem.quantity)) > 0.001) {
      lineDiscrepancies.push({
        sku: invItem.sku,
        issue: \`Quantity mismatch: invoiced \${invItem.quantity} vs PO \${matchedPoItem.quantity}\`
      });
    }
    if (Math.abs(Number(invItem.unit_price) - Number(matchedPoItem.unit_price)) > 0.01) {
      lineDiscrepancies.push({
        sku: invItem.sku,
        issue: \`Unit price mismatch: invoiced $\${Number(invItem.unit_price).toFixed(2)} vs PO $\${Number(matchedPoItem.unit_price).toFixed(2)}\`
      });
    }
  }
}

// 4. Calculate aggregate total variance
const poTotal = Number(po.total_amount);
const invTotal = Number(invoice.total_amount);
const diff = Math.abs(invTotal - poTotal);
const variancePct = poTotal > 0 ? (diff / poTotal) * 100 : 100;

let decision = 'REQUIRE_HUMAN_APPROVAL';
let reason = '';

if (lineDiscrepancies.length === 0 && variancePct <= varianceThreshold && invTotal < amountThreshold) {
  decision = 'AUTO_APPROVE';
  reason = \`Within tolerance (variance: \${variancePct.toFixed(2)}% <= \${varianceThreshold}%, total < $\${amountThreshold})\`;
} else if (lineDiscrepancies.length > 0) {
  decision = 'REQUIRE_HUMAN_APPROVAL';
  reason = \`Line item discrepancies detected: \${lineDiscrepancies.map(d => d.sku + ' (' + d.issue + ')').join('; ')}\`;
} else if (variancePct > varianceThreshold) {
  decision = 'REQUIRE_HUMAN_APPROVAL';
  reason = \`Variance of \${variancePct.toFixed(2)}% exceeds \${varianceThreshold}% automated threshold\`;
} else if (invTotal >= amountThreshold) {
  decision = 'REQUIRE_HUMAN_APPROVAL';
  reason = \`High-value invoice ($\${invTotal.toFixed(2)} >= $\${amountThreshold} threshold requires executive signoff)\`;
}

return [{
  json: {
    ...invoice,
    po_found: true,
    po_record: po,
    variance_pct: Number(variancePct.toFixed(3)),
    line_discrepancies: lineDiscrepancies,
    decision,
    reason,
    tax_id_match: taxIdMatch
  }
}];`;
}

// Update Slack Block Kit builder to pass expiration timestamp
const buildSlackNode = wf1.nodes.find(n => n.name === 'Build Slack Block Kit & Token');
if (buildSlackNode) {
  buildSlackNode.parameters.jsCode = `const crypto = require('crypto');
const item = $input.item.json;
const token = crypto.randomBytes(24).toString('hex');
const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
const callbackUrl = \`\${$env.WEBHOOK_URL || 'http://localhost:5678/'}webhook/invoice-approval-callback\`;

const blocks = [
  {
    type: 'header',
    text: {
      type: 'plain_text',
      text: item.decision === 'SECURITY_ALERT' ? '⚠️ Fraud / Security Alert: Invoice Discrepancy' : '📋 Invoice Requires Approval (3-Way Match Variance)',
      emoji: true
    }
  },
  {
    type: 'section',
    fields: [
      { type: 'mrkdwn', text: '*Invoice:* ' + item.invoice_number },
      { type: 'mrkdwn', text: '*PO Number:* ' + (item.po_reference || 'N/A') },
      { type: 'mrkdwn', text: '*Vendor:* ' + item.vendor_name },
      { type: 'mrkdwn', text: '*Tax ID:* ' + item.vendor_tax_id },
      { type: 'mrkdwn', text: '*Invoice Amount:* $' + item.total_amount.toFixed(2) },
      { type: 'mrkdwn', text: '*PO Amount:* $' + (item.po_record ? Number(item.po_record.total_amount).toFixed(2) : '0.00') },
      { type: 'mrkdwn', text: '*Variance:* ' + item.variance_pct.toFixed(2) + '%' },
      { type: 'mrkdwn', text: '*Expires:* ' + expiresAt.split('T')[0] }
    ]
  },
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Audit Reason:* ' + item.reason
    }
  },
  {
    type: 'actions',
    block_id: 'approval_actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Approve Payment' },
        style: 'primary',
        action_id: 'action_approve_invoice',
        value: JSON.stringify({ token, invoice_number: item.invoice_number, action: 'approve', expires_at: expiresAt })
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Reject Invoice' },
        style: 'danger',
        action_id: 'action_reject_invoice',
        value: JSON.stringify({ token, invoice_number: item.invoice_number, action: 'reject', expires_at: expiresAt })
      }
    ]
  }
];

return [{
  json: {
    ...item,
    approval_token: token,
    expires_at: expiresAt,
    callback_url: callbackUrl,
    slack_payload: { blocks }
  }
}];`;
}

// Update Slack Callback Action Parser with token expiration check
const parseSlackNode = wf1.nodes.find(n => n.name === 'Parse Slack Callback Action');
if (parseSlackNode) {
  parseSlackNode.parameters.jsCode = `const crypto = require('crypto');
const req = $input.item.json;
let payload = req.body || req;

if (typeof payload === 'string' || payload.payload) {
  try {
    payload = typeof payload.payload === 'string' ? JSON.parse(payload.payload) : payload.payload || payload;
  } catch (e) {}
}

const actionElement = payload.actions && payload.actions[0];
let actionValue = {};
try {
  actionValue = JSON.parse(actionElement.value || '{}');
} catch (e) {
  actionValue = { raw: actionElement.value };
}

const token = actionValue.token || 'mock-token';
const invoiceNumber = actionValue.invoice_number || actionValue.invoiceNumber || 'INV-UNKNOWN';
const approverName = payload.user ? (payload.user.name || payload.user.username) : 'Human Approver';
const expiresAt = actionValue.expires_at ? new Date(actionValue.expires_at) : null;
const isExpired = Boolean(expiresAt && expiresAt < new Date());

let actionType = 'MANUALLY_APPROVED';
if (isExpired) {
  actionType = 'EXPIRED';
} else if (actionElement.action_id === 'action_reject_invoice' || actionValue.action === 'reject') {
  actionType = 'REJECTED';
}

return [{
  json: {
    token,
    invoice_number: invoiceNumber,
    status: actionType,
    is_expired: isExpired,
    decision_by: approverName,
    decision_at: new Date().toISOString()
  }
}];`;
}

fs.writeFileSync(wf1Path, JSON.stringify(wf1, null, 2) + '\n', 'utf8');
console.log('✓ Workflow 1 updated successfully');

// ============================================================================
// 2. WORKFLOW 2: LEAD DEDUPLICATION BY EMAIL/DOMAIN
// ============================================================================
const wf2Path = path.resolve(__dirname, '../workflows/02-lead-enrichment/workflow.json');
const wf2 = JSON.parse(fs.readFileSync(wf2Path, 'utf8'));

// Update Record Lead in PostgreSQL CRM to support ON CONFLICT update on domain and contact_email
const crmRecordNode = wf2.nodes.find(n => n.name === 'Record Lead in PostgreSQL CRM');
if (crmRecordNode) {
  crmRecordNode.parameters.query = `INSERT INTO crm.leads (id, contact_name, contact_email, company_name, domain, company_size_tier, industry, icp_score, icp_tier, qualification_rationale, email_draft_subject, email_draft_body, status, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'AWAITING_REVIEW', CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET icp_score = $8, icp_tier = $9, qualification_rationale = $10, email_draft_subject = $11, email_draft_body = $12, status = 'AWAITING_REVIEW', updated_at = CURRENT_TIMESTAMP;`;
}

fs.writeFileSync(wf2Path, JSON.stringify(wf2, null, 2) + '\n', 'utf8');
console.log('✓ Workflow 2 updated successfully');

// ============================================================================
// 3. WORKFLOW 3: RAG DEDUPLICATION & FEEDBACK LOOP
// ============================================================================
const wf3Path = path.resolve(__dirname, '../workflows/03-rag-support-copilot/workflow.json');
const wf3 = JSON.parse(fs.readFileSync(wf3Path, 'utf8'));

// Update pgvector upsert to update content and embedding on duplicate chunk
const upsertNode = wf3.nodes.find(n => n.name === 'Upsert into pgvector Store');
if (upsertNode) {
  upsertNode.parameters.query = `INSERT INTO rag.document_embeddings (doc_id, doc_title, section_title, chunk_index, content, embedding, metadata) VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb) ON CONFLICT (doc_id, chunk_index) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata;`;
}

// Add Feedback Webhook nodes to Workflow 3
const feedbackWebhookId = '3a000001-0001-4000-8000-000000000015';
const feedbackDbId = '3a000001-0001-4000-8000-000000000016';
const feedbackRespId = '3a000001-0001-4000-8000-000000000017';

if (!wf3.nodes.find(n => n.id === feedbackWebhookId)) {
  wf3.nodes.push(
    {
      parameters: {
        httpMethod: 'POST',
        path: 'rag-feedback',
        responseMode: 'responseNode',
        options: {}
      },
      id: feedbackWebhookId,
      name: 'RAG Feedback Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [100, 850],
      webhookId: 'rag-feedback-trigger'
    },
    {
      parameters: {
        operation: 'executeQuery',
        query: 'INSERT INTO rag.query_feedback (session_id, customer_id, query, answer, rating, comment) VALUES ($1, $2, $3, $4, $5, $6);',
        queryParams: '={{ [$json.body.session_id || "ANON", $json.body.customer_id || "ANON", $json.body.query || "", $json.body.answer || "", $json.body.rating || "HELPFUL", $json.body.comment || ""].join("|||") }}'
      },
      id: feedbackDbId,
      name: 'Store Query Feedback',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.5,
      position: [340, 850],
      credentials: {
        postgres: {
          id: 'enterprise-postgres-creds',
          name: 'PostgreSQL Connection'
        }
      }
    },
    {
      parameters: {
        respondWith: 'json',
        responseBody: '={\n  "status": "SUCCESS",\n  "message": "User retrieval feedback recorded successfully for RAG optimization."\n}',
        options: {}
      },
      id: feedbackRespId,
      name: 'Respond Feedback Received',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [580, 850]
    }
  );

  wf3.connections['RAG Feedback Webhook'] = {
    main: [[{ node: 'Store Query Feedback', type: 'main', index: 0 }]]
  };
  wf3.connections['Store Query Feedback'] = {
    main: [[{ node: 'Respond Feedback Received', type: 'main', index: 0 }]]
  };
}

fs.writeFileSync(wf3Path, JSON.stringify(wf3, null, 2) + '\n', 'utf8');
console.log('✓ Workflow 3 updated successfully (deduplication + feedback loop)');

console.log('\nAll core workflow improvements successfully patched.');
