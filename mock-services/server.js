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

// Helper to render Slack Block Kit messages into visual HTML
function renderSlackBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  return blocks.map(b => {
    if (b.type === 'header') {
      return '<div class="slack-header">' + escapeHtml(b.text && b.text.text ? b.text.text : '') + '</div>';
    }
    if (b.type === 'section') {
      let out = '';
      if (b.text) {
        out += '<div class="slack-text">' + formatSlackMarkdown(b.text.text || '') + '</div>';
      }
      if (Array.isArray(b.fields) && b.fields.length > 0) {
        out += '<div class="slack-fields-grid">';
        b.fields.forEach(f => {
          out += '<div class="slack-field">' + formatSlackMarkdown(f.text || '') + '</div>';
        });
        out += '</div>';
      }
      return out;
    }
    if (b.type === 'actions') {
      const btns = (b.elements || []).map(el => {
        const styleClass = el.style === 'primary' ? 'slack-btn-primary' : (el.style === 'danger' ? 'slack-btn-danger' : 'slack-btn-default');
        return '<button class="slack-btn ' + styleClass + '">' + escapeHtml(el.text && el.text.text ? el.text.text : 'Action') + '</button>';
      }).join(' ');
      return '<div class="slack-actions">' + btns + '</div>';
    }
    return '';
  }).join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSlackMarkdown(str) {
  let s = escapeHtml(str);
  s = s.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\n/g, '<br/>');
  return s;
}

// Seed endpoint for realistic demo visualization
app.post('/api/seed-demo', (req, res) => {
  slackMessages.length = 0;
  erpPayments.length = 0;
  crmUpdates.length = 0;

  // 1. High-Value Invoice Slack Approval Card
  slackMessages.push({
    id: 'slack-msg-' + Date.now(),
    receivedAt: new Date(Date.now() - 120000).toISOString(),
    body: {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '⚠️ Financial Audit Signoff Required' }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: '*Vendor:* Global Cloud Logistics' },
            { type: 'mrkdwn', text: '*Tax ID:* `US-88391024`' },
            { type: 'mrkdwn', text: '*Invoice:* `INV-2026-0921`' },
            { type: 'mrkdwn', text: '*PO Ref:* `PO-2026-002`' },
            { type: 'mrkdwn', text: '*Total Amount:* $12,960.00 USD' },
            { type: 'mrkdwn', text: '*Variance:* 0.00% (High Value Threshold)' }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Line Item Audit:*\n• 4x Dedicated Dedicated Air Freight @ $2,500.00\n• 4x Expedited Customs Clearance @ $500.00\n• Tax (8%): $960.00'
          }
        },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Approve & Release Payment' }, style: 'primary' },
            { type: 'button', text: { type: 'plain_text', text: 'Reject & Flag Vendor' }, style: 'danger' }
          ]
        }
      ]
    }
  });

  // 2. Lead Qualification Card
  slackMessages.push({
    id: 'slack-msg-' + (Date.now() + 1),
    receivedAt: new Date(Date.now() - 45000).toISOString(),
    body: {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🎯 New Qualified Lead: FinScale Analytics (Score: 96/100)' }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: '*Contact:* Elena Rostova' },
            { type: 'mrkdwn', text: '*Domain:* `finscale-analytics.com`' },
            { type: 'mrkdwn', text: '*ICP Tier:* *Tier 1 - High Priority*' },
            { type: 'mrkdwn', text: '*Industry:* Financial Technology' },
            { type: 'mrkdwn', text: '*Company Size:* 100-500 employees' },
            { type: 'mrkdwn', text: '*Tech Stack:* `PostgreSQL, pgvector, n8n`' }
          ]
        },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Approve & Send Outreach' }, style: 'primary' },
            { type: 'button', text: { type: 'plain_text', text: 'View in HubSpot' }, style: 'default' }
          ]
        }
      ]
    }
  });

  // ERP Payment
  erpPayments.push({
    paymentId: 'PAY-2026-8819',
    receivedAt: new Date(Date.now() - 30000).toISOString(),
    payload: {
      invoice_number: 'INV-2026-0012',
      po_number: 'PO-2026-001',
      vendor_name: 'Acme Cloud Solutions LLC',
      total_amount: 1620.00,
      currency: 'USD',
      decision: 'AUTO_APPROVED',
      status: 'DISPATCHED_TO_ACH'
    }
  });

  // CRM Update
  crmUpdates.push({
    syncId: 'CRM-SYNC-9014',
    receivedAt: new Date(Date.now() - 20000).toISOString(),
    payload: {
      lead_id: 'LEAD-FINSCALE-01',
      contact_name: 'Elena Rostova',
      company_name: 'FinScale Analytics',
      icp_score: 96,
      icp_tier: 'Tier 1 - High Priority',
      status: 'AWAITING_REVIEW'
    }
  });

  res.json({ status: 'ok', message: 'Demo events successfully seeded' });
});

// Interactive HTML Inspection Dashboard
app.get('/dashboard', (req, res) => {
  const html = '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'  <meta charset="UTF-8">\n' +
'  <title>n8n Enterprise AI Pack — Live Operations Cockpit</title>\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n' +
'  <style>\n' +
'    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }\n' +
'    body { background: #0f172a; color: #f1f5f9; padding: 24px; min-height: 100vh; }\n' +
'    .cockpit-container { max-width: 1400px; margin: 0 auto; }\n' +
'    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid #1e293b; padding-bottom: 20px; flex-wrap: wrap; gap: 16px; }\n' +
'    .brand-group { display: flex; align-items: center; gap: 14px; }\n' +
'    .brand-avatar { width: 44px; height: 44px; border-radius: 12px; background: #00f5ff; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #0b0f19; font-size: 18px; box-shadow: 0 0 16px rgba(0, 245, 255, 0.35); }\n' +
'    h1 { font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; }\n' +
'    .subtitle { font-size: 13px; color: #94a3b8; margin-top: 3px; }\n' +
'    .status-group { display: flex; align-items: center; gap: 10px; }\n' +
'    .badge-live { background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #34d399; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }\n' +
'    .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981; }\n' +
'    .btn { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; text-decoration: none; transition: all 0.15s ease; }\n' +
'    .btn:hover { background: #334155; color: #ffffff; }\n' +
'    .btn-primary { background: #0284c7; border-color: #0284c7; color: white; }\n' +
'    .btn-primary:hover { background: #0369a1; }\n' +
'    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 28px; }\n' +
'    .stat-card { background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #334155; position: relative; overflow: hidden; }\n' +
'    .stat-card::before { content: ""; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #00f5ff; }\n' +
'    .stat-card.stat-green::before { background: #10b981; }\n' +
'    .stat-card.stat-amber::before { background: #f59e0b; }\n' +
'    .stat-card.stat-purple::before { background: #a855f7; }\n' +
'    .stat-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 600; margin-bottom: 8px; }\n' +
'    .stat-val { font-size: 32px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; }\n' +
'    .stat-meta { font-size: 11px; color: #64748b; margin-top: 6px; }\n' +
'    .main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }\n' +
'    .section-card { background: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; display: flex; flex-direction: column; }\n' +
'    .section-header { padding: 16px 20px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; background: #182234; }\n' +
'    .section-header h2 { font-size: 15px; font-weight: 600; color: #f8fafc; }\n' +
'    .pill { font-size: 11px; background: #0f172a; padding: 3px 8px; border-radius: 10px; color: #94a3b8; border: 1px solid #334155; }\n' +
'    .section-body { padding: 20px; flex: 1; overflow-y: auto; max-height: 520px; }\n' +
'    .slack-card-preview { background: #1e1f29; border: 1px solid #383a4c; border-radius: 10px; padding: 16px; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.25); }\n' +
'    .slack-header { font-size: 15px; font-weight: 700; color: #ffffff; margin-bottom: 12px; border-left: 3px solid #00f5ff; padding-left: 8px; }\n' +
'    .slack-text { font-size: 13px; color: #cbd5e1; line-height: 1.5; margin-bottom: 12px; }\n' +
'    .slack-fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin-bottom: 14px; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; }\n' +
'    .slack-field { font-size: 12px; color: #e2e8f0; line-height: 1.4; }\n' +
'    .slack-field strong { color: #94a3b8; font-weight: 600; }\n' +
'    .slack-field code { background: #0f172a; color: #38bdf8; padding: 2px 5px; border-radius: 4px; font-size: 11px; }\n' +
'    .slack-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }\n' +
'    .slack-btn { border: none; padding: 7px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }\n' +
'    .slack-btn:hover { opacity: 0.9; }\n' +
'    .slack-btn-primary { background: #007a5a; color: white; }\n' +
'    .slack-btn-danger { background: #e01e5a; color: white; }\n' +
'    .slack-btn-default { background: #383a4c; color: #f1f5f9; }\n' +
'    .table-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }\n' +
'    table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }\n' +
'    th { padding: 10px 12px; background: #0f172a; color: #94a3b8; font-weight: 600; border-bottom: 1px solid #334155; }\n' +
'    td { padding: 10px 12px; border-bottom: 1px solid rgba(51, 65, 85, 0.4); color: #cbd5e1; }\n' +
'    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }\n' +
'    .empty-state { text-align: center; color: #64748b; padding: 32px 16px; font-size: 13px; }\n' +
'    @media (max-width: 900px) { .main-grid { grid-template-columns: 1fr; } }\n' +
'    @media (max-width: 640px) {\n' +
'      body { padding: 14px; }\n' +
'      header { flex-direction: column; align-items: flex-start; }\n' +
'      .status-group { width: 100%; justify-content: space-between; }\n' +
'      .slack-fields-grid { grid-template-columns: 1fr; }\n' +
'      .stat-val { font-size: 26px; }\n' +
'    }\n' +
'  </style>\n' +
'</head>\n' +
'<body>\n' +
'  <div class="cockpit-container">\n' +
'    <header>\n' +
'      <div class="brand-group">\n' +
'        <div class="brand-avatar">n8n</div>\n' +
'        <div>\n' +
'          <h1>n8n Enterprise AI Pack — Live Operations Cockpit</h1>\n' +
'          <div class="subtitle">Multi-Agent Orchestration, Financial HITL Auditing & RAG Operations (Port ' + port + ')</div>\n' +
'        </div>\n' +
'      </div>\n' +
'      <div class="status-group">\n' +
'        <span class="badge-live"><span class="pulse-dot"></span> LIVE TESTBED</span>\n' +
'        <button class="btn btn-primary" onclick="seedDemoData()">Seed Demo</button>\n' +
'        <a href="/dashboard" class="btn">Refresh</a>\n' +
'      </div>\n' +
'    </header>\n' +
'    <div class="stats-grid">\n' +
'      <div class="stat-card">\n' +
'        <div class="stat-title">Slack HITL Notifications</div>\n' +
'        <div class="stat-val">' + slackMessages.length + '</div>\n' +
'        <div class="stat-meta">Pending and resolved review cards</div>\n' +
'      </div>\n' +
'      <div class="stat-card stat-green">\n' +
'        <div class="stat-title">ERP Payments Dispatched</div>\n' +
'        <div class="stat-val">' + erpPayments.length + '</div>\n' +
'        <div class="stat-meta">Reconciliation gates cleared</div>\n' +
'      </div>\n' +
'      <div class="stat-card stat-amber">\n' +
'        <div class="stat-title">CRM Qualified Leads</div>\n' +
'        <div class="stat-val">' + crmUpdates.length + '</div>\n' +
'        <div class="stat-meta">High-priority ICP pipeline synced</div>\n' +
'      </div>\n' +
'      <div class="stat-card stat-purple">\n' +
'        <div class="stat-title">System Uptime</div>\n' +
'        <div class="stat-val">' + Math.floor(process.uptime()) + 's</div>\n' +
'        <div class="stat-meta">Continuous RAG & vector memory active</div>\n' +
'      </div>\n' +
'    </div>\n' +
'    <div class="main-grid">\n' +
'      <div class="section-card">\n' +
'        <div class="section-header">\n' +
'          <h2>Slack Block Kit Approval Stream</h2>\n' +
'          <span class="pill">' + slackMessages.length + ' dispatched</span>\n' +
'        </div>\n' +
'        <div class="section-body">\n' +
'          ' + (slackMessages.length === 0 ? '<div class="empty-state">No Slack notifications dispatched yet. Click "Seed Demo" or trigger an n8n workflow.</div>' : slackMessages.slice().reverse().map(m => '<div class="slack-card-preview">' + renderSlackBlocks(m.body && m.body.blocks ? m.body.blocks : []) + '<div style="font-size: 10px; color: #64748b; margin-top: 10px; border-top: 1px solid #2d3142; padding-top: 6px; display: flex; justify-content: space-between;"><span>Event ID: <code>' + m.id + '</code></span><span>Received: ' + m.receivedAt.split('T')[1].replace('Z', '') + '</span></div></div>').join('')) + '\n' +
'        </div>\n' +
'      </div>\n' +
'      <div class="section-card">\n' +
'        <div class="section-header">\n' +
'          <h2>ERP & CRM Settlement Audit Trail</h2>\n' +
'          <span class="pill">' + (erpPayments.length + crmUpdates.length) + ' transactions</span>\n' +
'        </div>\n' +
'        <div class="section-body">\n' +
'          <h3 style="font-size: 13px; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">ERP Payment Confirmations</h3>\n' +
'          <div class="table-container" style="margin-bottom: 20px;">\n' +
'            <table>\n' +
'              <thead><tr><th>Payment ID</th><th>Invoice</th><th>Vendor</th><th>Total</th><th>Status</th></tr></thead>\n' +
'              <tbody>\n' +
'                ' + (erpPayments.length === 0 ? '<tr><td colspan="5" class="empty-state">No payment records logged.</td></tr>' : erpPayments.slice().reverse().map(p => '<tr><td><code>' + p.paymentId + '</code></td><td><code>' + (p.payload && p.payload.invoice_number ? p.payload.invoice_number : 'N/A') + '</code></td><td>' + (p.payload && p.payload.vendor_name ? p.payload.vendor_name : 'Vendor') + '</td><td style="color: #34d399; font-weight: 600;">$' + (p.payload && p.payload.total_amount ? Number(p.payload.total_amount).toFixed(2) : '0.00') + '</td><td><span style="background: rgba(16,185,129,0.2); color: #34d399; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;">' + (p.payload && p.payload.status ? p.payload.status : 'PAID') + '</span></td></tr>').join('')) + '\n' +
'              </tbody>\n' +
'            </table>\n' +
'          </div>\n' +
'          <h3 style="font-size: 13px; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">CRM Lead Pipeline Ingestion</h3>\n' +
'          <div class="table-container">\n' +
'            <table>\n' +
'              <thead><tr><th>Sync ID</th><th>Company</th><th>Contact</th><th>Score</th><th>Tier</th></tr></thead>\n' +
'              <tbody>\n' +
'                ' + (crmUpdates.length === 0 ? '<tr><td colspan="5" class="empty-state">No CRM leads recorded.</td></tr>' : crmUpdates.slice().reverse().map(c => '<tr><td><code>' + c.syncId + '</code></td><td style="font-weight: 600; color: #f1f5f9;">' + (c.payload && c.payload.company_name ? c.payload.company_name : 'N/A') + '</td><td>' + (c.payload && c.payload.contact_name ? c.payload.contact_name : 'N/A') + '</td><td><span style="color: #38bdf8; font-weight: 700;">' + (c.payload && c.payload.icp_score ? c.payload.icp_score : 'N/A') + ' / 100</span></td><td><span style="background: rgba(56,189,248,0.2); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">' + (c.payload && c.payload.icp_tier ? c.payload.icp_tier.split(' - ')[0] : 'Tier 1') + '</span></td></tr>').join('')) + '\n' +
'              </tbody>\n' +
'            </table>\n' +
'          </div>\n' +
'        </div>\n' +
'      </div>\n' +
'    </div>\n' +
'  </div>\n' +
'  <script>\n' +
'    async function seedDemoData() {\n' +
'      await fetch("/api/seed-demo", { method: "POST" });\n' +
'      window.location.reload();\n' +
'    }\n' +
'  </script>\n' +
'</body>\n' +
'</html>';
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
