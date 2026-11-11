const express = require('express');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 4000;
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET || 'sample_slack_signing_secret_12345';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// In-memory inspection stores for testing
const slackMessages = [];
const erpPayments = [];
const crmUpdates = [];

// Helper: deterministic embedding vector (1536 dims)
function generateDeterministicEmbedding(text) {
  const dims = 1536;
  const vector = new Array(dims);
  const hash = crypto.createHash('sha256').update(text || '').digest();
  
  for (let i = 0; i < dims; i++) {
    const byteIndex = i % hash.length;
    const factor = (hash[byteIndex] / 255.0) * 2.0 - 1.0;
    const posComponent = Math.sin((i + 1) * 0.05);
    vector[i] = parseFloat(((factor * 0.7 + posComponent * 0.3) / 2.0).toFixed(6));
  }
  
  // Normalize vector to unit length
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1.0;
  return vector.map(val => parseFloat((val / norm).toFixed(6)));
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Interactive HTML Inspection Dashboard
app.get('/dashboard', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>n8n Enterprise Mock Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #f8fafc; color: #1e293b; padding: 24px; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 700; color: #0f172a; }
    .badge { background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: white; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .stat-title { font-size: 13px; color: #64748b; margin-bottom: 4px; }
    .stat-val { font-size: 28px; font-weight: 700; color: #0f172a; }
    .section { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; }
    h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 12px; background: #f1f5f9; color: #475569; font-weight: 600; }
    td { padding: 10px 12px; border-top: 1px solid #e2e8f0; vertical-align: top; }
    pre { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; max-height: 250px; }
    .empty { color: #94a3b8; font-style: italic; padding: 16px 0; }
    .btn { background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; }
    .btn:hover { background: #2563eb; }
    .btn-danger { background: #ef4444; }
    .btn-danger:hover { background: #dc2626; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>n8n Enterprise AI Pack — Mock Services Dashboard</h1>
      <p style="font-size: 13px; color: #64748b; margin-top: 4px;">Local inspection server running on port ${port} (Uptime: ${Math.floor(process.uptime())}s)</p>
    </div>
    <div>
      <span class="badge">STANDALONE TESTBED ACTIVE</span>
      <a href="/dashboard" class="btn" style="margin-left: 8px; text-decoration: none; display: inline-block;">Refresh</a>
    </div>
  </header>

  <div class="stats">
    <div class="stat-card">
      <div class="stat-title">Slack Notifications</div>
      <div class="stat-val">${slackMessages.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">ERP Payments Dispatched</div>
      <div class="stat-val">${erpPayments.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">CRM Leads Synced</div>
      <div class="stat-val">${crmUpdates.length}</div>
    </div>
  </div>

  <div class="section">
    <h2>Recent Slack Webhook Notifications <span>(${slackMessages.length} total)</span></h2>
    ${slackMessages.length === 0 ? '<div class="empty">No Slack messages received yet. Run tests or trigger workflows to inspect.</div>' : `
    <table>
      <thead>
        <tr><th>ID</th><th>Timestamp</th><th>Payload Preview</th></tr>
      </thead>
      <tbody>
        ${slackMessages.slice(-5).reverse().map(m => `
          <tr>
            <td style="font-family: monospace; font-size: 11px;">${m.id}</td>
            <td style="white-space: nowrap;">${m.receivedAt.split('T')[1].replace('Z', '')}</td>
            <td><pre>${JSON.stringify(m.body, null, 2)}</pre></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`}
  </div>

  <div class="section">
    <h2>ERP Payments Processed <span>(${erpPayments.length} total)</span></h2>
    ${erpPayments.length === 0 ? '<div class="empty">No ERP payments queued yet.</div>' : `
    <table>
      <thead>
        <tr><th>Payment ID</th><th>Received At</th><th>Payload Details</th></tr>
      </thead>
      <tbody>
        ${erpPayments.slice(-5).reverse().map(p => `
          <tr>
            <td style="font-family: monospace; font-weight: 600;">${p.paymentId}</td>
            <td>${p.receivedAt}</td>
            <td><pre>${JSON.stringify(p.payload, null, 2)}</pre></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`}
  </div>

  <div class="section">
    <h2>CRM Sync Updates <span>(${crmUpdates.length} total)</span></h2>
    ${crmUpdates.length === 0 ? '<div class="empty">No CRM updates logged yet.</div>' : `
    <table>
      <thead>
        <tr><th>Sync ID</th><th>Contact ID</th><th>Timestamp</th><th>Details</th></tr>
      </thead>
      <tbody>
        ${crmUpdates.slice(-5).reverse().map(c => `
          <tr>
            <td style="font-family: monospace;">${c.syncId}</td>
            <td>${c.payload?.lead_id || 'N/A'}</td>
            <td>${c.receivedAt}</td>
            <td><pre>${JSON.stringify(c.payload, null, 2)}</pre></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`}
  </div>
</body>
</html>`;
  res.send(html);
});

// OpenAI compatible /v1/chat/completions
app.post('/v1/chat/completions', (req, res) => {
  const { messages, model, response_format } = req.body;
  const userMessage = messages?.find(m => m.role === 'user')?.content || '';
  const systemMessage = messages?.find(m => m.role === 'system')?.content || '';
  const combined = (systemMessage + ' ' + userMessage).toLowerCase();

  let contentResponse = '';

  // 1. Invoice Extraction
  if (combined.includes('invoice') || combined.includes('vendor_name') || combined.includes('line_items')) {
    // Check for high-value / discrepancy indicators
    if (combined.includes('po-2026-002') || combined.includes('global logistics')) {
      contentResponse = JSON.stringify({
        vendor_name: 'Global Logistics Partners Inc',
        vendor_tax_id: 'US-88391024',
        invoice_number: 'INV-2026-0921',
        invoice_date: '2026-11-10',
        po_reference: 'PO-2026-002',
        currency: 'USD',
        line_items: [
          { sku: 'FRT-AIR-EXP', description: 'International Express Air Freight', quantity: 4, unit_price: 2500.00, total_price: 10000.00 },
          { sku: 'CUST-CLEAR', description: 'Customs Clearance Handling', quantity: 4, unit_price: 500.00, total_price: 2000.00 }
        ],
        subtotal: 12000.00,
        tax_amount: 960.00,
        total_amount: 12960.00
      });
    } else if (combined.includes('po-2026-003') || combined.includes('cloudscale')) {
      // Variance test case (5% variance on price)
      contentResponse = JSON.stringify({
        vendor_name: 'CloudScale Technologies',
        vendor_tax_id: 'US-11029482',
        invoice_number: 'INV-2026-8841',
        invoice_date: '2026-11-09',
        po_reference: 'PO-2026-003',
        currency: 'USD',
        line_items: [
          { sku: 'DEV-ENV-POD', description: 'Kubernetes Dedicated Dev Pod', quantity: 2, unit_price: 435.00, total_price: 870.00 }
        ],
        subtotal: 870.00,
        tax_amount: 69.60,
        total_amount: 939.60
      });
    } else {
      // Default exact match (Acme)
      contentResponse = JSON.stringify({
        vendor_name: 'Acme Cloud Solutions LLC',
        vendor_tax_id: 'US-94281901',
        invoice_number: 'INV-2026-0012',
        invoice_date: '2026-11-11',
        po_reference: 'PO-2026-001',
        currency: 'USD',
        line_items: [
          { sku: 'CLOUD-SUB-M', description: 'Monthly Cloud Hosting Tier M', quantity: 1, unit_price: 1000.00, total_price: 1000.00 },
          { sku: 'SUPP-PREM', description: 'Premium 24/7 SLA Support', quantity: 1, unit_price: 500.00, total_price: 500.00 }
        ],
        subtotal: 1500.00,
        tax_amount: 120.00,
        total_amount: 1620.00
      });
    }
  }
  // 2. Lead ICP Scoring & Outbound Drafting
  else if (combined.includes('icp') || combined.includes('lead') || combined.includes('scoring')) {
    if (combined.includes('fintech') || combined.includes('tier 1') || combined.includes('datadrive')) {
      contentResponse = JSON.stringify({
        icp_score: 92,
        icp_tier: 'Tier 1 - High Priority',
        scores: {
          industry_fit: 24,
          company_size_fit: 23,
          tech_stack_fit: 22,
          pain_point_fit: 23
        },
        rationale: 'Target B2B fintech enterprise with 250+ employees using PostgreSQL and modern orchestration pipelines.',
        subject_lines: [
          'Scaling workflow compliance for DataDrive',
          'Question regarding DataDrive ledger automation',
          'Audit trail automation for your engineering squad'
        ],
        email_body: 'Hi Sarah,\n\nI noticed DataDrive recently expanded its compliance operations across multi-cloud infrastructure. Managing cross-system audit trails often creates bottlenecks between accounts payable and engineering.\n\nOur platform provides automated 3-way reconciliation and Human-in-the-Loop approval gates directly within Slack, reducing manual invoice triage time while maintaining strict compliance.\n\nWould you be open to a 10-minute walkthrough on how other fintech engineering teams structure this?\n\nBest regards,\nAlexandr'
      });
    } else {
      contentResponse = JSON.stringify({
        icp_score: 42,
        icp_tier: 'Tier 3 - Disqualified',
        scores: {
          industry_fit: 10,
          company_size_fit: 10,
          tech_stack_fit: 12,
          pain_point_fit: 10
        },
        rationale: 'Solo consultancy outside our primary ICP focus with minimal workflow automation volume.',
        subject_lines: [],
        email_body: ''
      });
    }
  }
  // 3. Grounded RAG Support Agent
  else if (combined.includes('rag') || combined.includes('support') || combined.includes('sla') || combined.includes('refund')) {
    if (combined.includes('cancel') || combined.includes('dispute') || combined.includes('lawyer')) {
      contentResponse = JSON.stringify({
        confidence_score: 0.45,
        escalate_to_human: true,
        reason: 'Sensitive dispute or cancellation request requiring human account manager review.',
        citations: [],
        answer: 'I have logged this cancellation request and connected you with our enterprise tier-2 account management team for immediate follow-up.'
      });
    } else {
      contentResponse = JSON.stringify({
        confidence_score: 0.94,
        escalate_to_human: false,
        citations: [
          { document: 'enterprise_sla.md', section: 'Uptime Commitment & P1 Incident Response' }
        ],
        answer: 'Our Enterprise SLA guarantees 99.95% monthly uptime with a 15-minute response time for Priority-1 incidents [Source: enterprise_sla.md - Uptime Commitment & P1 Incident Response]. Credits are applied automatically if monthly availability drops below this threshold.'
      });
    }
  } else {
    contentResponse = JSON.stringify({
      status: 'acknowledged',
      message: 'Mock OpenAI response completed successfully.',
      input_sample: userMessage.slice(0, 80)
    });
  }

  res.json({
    id: 'chatcmpl-' + crypto.randomBytes(8).toString('hex'),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'gpt-4o',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: contentResponse
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: 120,
      completion_tokens: 85,
      total_tokens: 205
    }
  });
});

// OpenAI compatible /v1/embeddings
app.post('/v1/embeddings', (req, res) => {
  const { input, model } = req.body;
  const inputs = Array.isArray(input) ? input : [input || ''];

  const data = inputs.map((item, index) => ({
    object: 'embedding',
    index,
    embedding: generateDeterministicEmbedding(item)
  }));

  res.json({
    object: 'list',
    data,
    model: model || 'text-embedding-3-small',
    usage: {
      prompt_tokens: 35 * inputs.length,
      total_tokens: 35 * inputs.length
    }
  });
});

// Slack Webhook endpoint (receives Block Kit notifications)
app.post('/slack/webhook', (req, res) => {
  const message = {
    id: 'slack-msg-' + Date.now(),
    receivedAt: new Date().toISOString(),
    headers: req.headers,
    body: req.body
  };
  slackMessages.push(message);
  res.json({ ok: true, messageId: message.id });
});

// Inspection: list received Slack messages
app.get('/slack/messages', (req, res) => {
  res.json({
    count: slackMessages.length,
    messages: slackMessages
  });
});

// Simulation helper: simulate Slack user clicking "Approve" or "Reject"
app.post('/slack/simulate-interactive-action', (req, res) => {
  const { token, action, invoiceNumber, webhookUrl } = req.body;
  const timestamp = Math.floor(Date.now() / 1000);
  
  const payload = {
    type: 'block_actions',
    user: { id: 'U12345678', username: 'alexandr.motologa', name: 'Alexandr Motologa' },
    api_app_id: 'A0123456',
    token: token || 'mock-action-token',
    container: { type: 'message', message_ts: '1700000000.000100' },
    trigger_id: '123456789.987654321',
    actions: [
      {
        action_id: action === 'reject' ? 'action_reject_invoice' : 'action_approve_invoice',
        block_id: 'approval_actions',
        value: JSON.stringify({ token, invoiceNumber, action: action || 'approve' }),
        type: 'button'
      }
    ]
  };

  const payloadString = 'payload=' + encodeURIComponent(JSON.stringify(payload));
  const sigBase = `v0:${timestamp}:${payloadString}`;
  const signature = 'v0=' + crypto.createHmac('sha256', slackSigningSecret).update(sigBase).digest('hex');

  res.json({
    action: action || 'approve',
    timestamp,
    signature,
    payload
  });
});

// Mock ERP payment endpoint
app.post('/erp/payment-webhook', (req, res) => {
  const paymentRecord = {
    paymentId: 'ERP-PAY-' + Date.now(),
    receivedAt: new Date().toISOString(),
    payload: req.body
  };
  erpPayments.push(paymentRecord);
  res.json({
    status: 'PROCESSED',
    paymentId: paymentRecord.paymentId,
    message: 'Payment queued for dispatch'
  });
});

// Inspection: list ERP payments
app.get('/erp/payments', (req, res) => {
  res.json({ count: erpPayments.length, payments: erpPayments });
});

// Mock CRM lead sync endpoint
app.post('/crm/sync', (req, res) => {
  const crmRecord = {
    syncId: 'CRM-SYNC-' + Date.now(),
    receivedAt: new Date().toISOString(),
    payload: req.body
  };
  crmUpdates.push(crmRecord);
  res.json({
    status: 'SUCCESS',
    syncId: crmRecord.syncId,
    contactId: 'CONTACT-' + Math.floor(Math.random() * 90000 + 10000)
  });
});

// Inspection: list CRM updates
app.get('/crm/updates', (req, res) => {
  res.json({ count: crmUpdates.length, updates: crmUpdates });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Mock simulation server running on port ${port}`);
  });
}

module.exports = app;
