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
