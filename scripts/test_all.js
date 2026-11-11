const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mockApp = require('../mock-services/server.js');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failedTests++;
  }
}

// Helper to make local HTTP requests
function httpRequest({ port, path: reqPath, method = 'GET', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (payload && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: reqHeaders
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ statusCode: res.statusCode, data, json, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTestSuite() {
  console.log('=== n8n Enterprise AI Pack Comprehensive Test Suite ===\n');

  // 1. Start in-process Mock Simulation Server on port 4005
  const mockPort = 4005;
  const server = mockApp.listen(mockPort);
  await new Promise(resolve => setTimeout(resolve, 300));

  console.log('[Suite 1: Mock Simulation Server Verification]');
  try {
    const health = await httpRequest({ port: mockPort, path: '/health' });
    assert(health.statusCode === 200 && health.json.status === 'ok', 'GET /health responds 200 OK');

    const embRes = await httpRequest({
      port: mockPort,
      path: '/v1/embeddings',
      method: 'POST',
      body: { input: 'Enterprise Uptime SLA Guarantee', model: 'text-embedding-3-small' }
    });
    assert(
      embRes.statusCode === 200 &&
      embRes.json.data &&
      embRes.json.data[0].embedding.length === 1536,
      'POST /v1/embeddings generates 1536-dimensional float vector'
    );

    const chatRes = await httpRequest({
      port: mockPort,
      path: '/v1/chat/completions',
      method: 'POST',
      body: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Extract invoice data for Acme Cloud Solutions PO-2026-001' }]
      }
    });
    assert(
      chatRes.statusCode === 200 &&
      chatRes.json.choices[0].message.content.includes('Acme Cloud Solutions LLC'),
      'POST /v1/chat/completions performs structured extraction'
    );

    const slackWebhookRes = await httpRequest({
      port: mockPort,
      path: '/slack/webhook',
      method: 'POST',
      body: { text: 'Test notification from n8n test suite' }
    });
    assert(slackWebhookRes.statusCode === 200 && slackWebhookRes.json.ok === true, 'POST /slack/webhook accepts notifications');

    const slackSimRes = await httpRequest({
      port: mockPort,
      path: '/slack/simulate-interactive-action',
      method: 'POST',
      body: { token: 'tok_test123', action: 'approve', invoiceNumber: 'INV-2026-0012' }
    });
    assert(
      slackSimRes.statusCode === 200 &&
      slackSimRes.json.signature.startsWith('v0='),
      'POST /slack/simulate-interactive-action generates signed callback payloads'
    );

    const erpPayRes = await httpRequest({
      port: mockPort,
      path: '/erp/payment-webhook',
      method: 'POST',
      body: { invoice_number: 'INV-2026-0012', total_amount: 1620.00 }
    });
    assert(erpPayRes.statusCode === 200 && erpPayRes.json.status === 'PROCESSED', 'POST /erp/payment-webhook processes payment execution');

    const crmSyncRes = await httpRequest({
      port: mockPort,
      path: '/crm/sync',
      method: 'POST',
      body: { lead_id: 'LEAD-901', company_name: 'DataDrive Technologies' }
    });
    assert(crmSyncRes.statusCode === 200 && crmSyncRes.json.status === 'SUCCESS', 'POST /crm/sync processes CRM lead sync');

    const dashRes = await httpRequest({ port: mockPort, path: '/dashboard' });
    assert(
      dashRes.statusCode === 200 && dashRes.data.includes('n8n Enterprise AI Pack'),
      'GET /dashboard serves interactive HTML inspection UI'
    );
  } catch (err) {
    assert(false, 'Mock Simulation Server Tests', err.message);
  }

  console.log('\n[Suite 2: Workflow 1 (Invoice 3-Way Match & Tolerance Engine)]');
  {
    // Load and extract the node evaluation function
    const wf1Path = path.resolve(__dirname, '../workflows/01-invoice-auditor/workflow.json');
    const wf1 = JSON.parse(fs.readFileSync(wf1Path, 'utf8'));

    // Test math validation logic
    const validateMathCode = wf1.nodes.find(n => n.name === 'Normalize & Validate Invoice Math').parameters.jsCode;
    const testMathFunction = new Function('$input', validateMathCode);

    const validInvoiceInput = {
      item: {
        json: {
          vendor_name: 'Acme Cloud Solutions LLC',
          vendor_tax_id: 'US-94281901',
          invoice_number: 'INV-2026-0012',
          po_reference: 'PO-2026-001',
          line_items: [
            { sku: 'CLOUD-SUB-M', quantity: 1, unit_price: 1000.00, total_price: 1000.00 },
            { sku: 'SUPP-PREM', quantity: 1, unit_price: 500.00, total_price: 500.00 }
          ],
          subtotal: 1500.00,
          tax_amount: 120.00,
          total_amount: 1620.00
        }
      }
    };
    const mathResult = testMathFunction(validInvoiceInput);
    assert(mathResult[0].json.math_valid === true, 'Invoice line items and subtotal math validation succeeds');
    assert(mathResult[0].json.calculated_subtotal === 1500.00, 'Calculated subtotal accurately matches sum of lines');

    // Test 3-way match & tolerance evaluation logic
    const evalToleranceCode = wf1.nodes.find(n => n.name === 'Evaluate 3-Way Match & Variance').parameters.jsCode;
    const defaultEnv = { INVOICE_VARIANCE_THRESHOLD_PCT: '0.5', INVOICE_HITL_AMOUNT_THRESHOLD: '2000' };

    // Scenario A: Exact Match, Under $2,000 threshold -> AUTO_APPROVE
    {
      const evalFuncA = new Function('$input', '$', '$env', evalToleranceCode);
      const mockEnvA = {
        first: () => ({ json: mathResult[0].json })
      };
      const mockInputA = {
        all: () => [{
          json: {
            po_number: 'PO-2026-001',
            vendor_tax_id: 'US-94281901',
            total_amount: '1620.00',
            po_items: [
              { sku: 'CLOUD-SUB-M', quantity: 1, unit_price: 1000.00 },
              { sku: 'SUPP-PREM', quantity: 1, unit_price: 500.00 }
            ]
          }
        }]
      };
      const resA = evalFuncA(mockInputA, () => mockEnvA, defaultEnv);
      assert(resA[0].json.decision === 'AUTO_APPROVE', 'Auto-Approve: variance 0% and total < $2,000');
    }

    // Scenario B: High Value Invoice >= $2,000 -> REQUIRE_HUMAN_APPROVAL
    {
      const evalFuncB = new Function('$input', '$', '$env', evalToleranceCode);
      const highValInvoice = {
        ...mathResult[0].json,
        invoice_number: 'INV-2026-0921',
        total_amount: 12960.00,
        vendor_tax_id: 'US-88391024',
        line_items: [
          { sku: 'FRT-AIR-EXP', quantity: 4, unit_price: 2500.00 },
          { sku: 'CUST-CLEAR', quantity: 4, unit_price: 500.00 }
        ]
      };
      const mockEnvB = { first: () => ({ json: highValInvoice }) };
      const mockInputB = {
        all: () => [{
          json: {
            po_number: 'PO-2026-002',
            vendor_tax_id: 'US-88391024',
            total_amount: '12960.00',
            po_items: [
              { sku: 'FRT-AIR-EXP', quantity: 4, unit_price: 2500.00 },
              { sku: 'CUST-CLEAR', quantity: 4, unit_price: 500.00 }
            ]
          }
        }]
      };
      const resB = evalFuncB(mockInputB, () => mockEnvB, defaultEnv);
      assert(resB[0].json.decision === 'REQUIRE_HUMAN_APPROVAL', 'Human Review: invoice total >= $2,000 threshold requires signoff');
    }

    // Scenario C: Discrepancy > 0.5% Variance -> REQUIRE_HUMAN_APPROVAL
    {
      const evalFuncC = new Function('$input', '$', '$env', evalToleranceCode);
      const discrepancyInvoice = {
        ...mathResult[0].json,
        invoice_number: 'INV-2026-8841',
        total_amount: 939.60,
        vendor_tax_id: 'US-11029482',
        line_items: [{ sku: 'DEV-ENV-POD', quantity: 2, unit_price: 435.00 }]
      };
      const mockEnvC = { first: () => ({ json: discrepancyInvoice }) };
      const mockInputC = {
        all: () => [{
          json: {
            po_number: 'PO-2026-003',
            vendor_tax_id: 'US-11029482',
            total_amount: '864.00',
            po_items: [{ sku: 'DEV-ENV-POD', quantity: 2, unit_price: 400.00 }]
          }
        }]
      };
      const resC = evalFuncC(mockInputC, () => mockEnvC, defaultEnv);
      assert(resC[0].json.decision === 'REQUIRE_HUMAN_APPROVAL', 'Discrepancy Gate: variance of 8.75% correctly triggers HITL review');
      assert(resC[0].json.variance_pct > 8.0, 'Calculated variance exceeds 8%');
    }

    // Scenario D: Tax ID Mismatch Fraud Alert -> SECURITY_ALERT
    {
      const evalFuncD = new Function('$input', '$', '$env', evalToleranceCode);
      const spoofedInvoice = {
        ...mathResult[0].json,
        invoice_number: 'INV-2026-9999',
        total_amount: 3240.00,
        vendor_tax_id: 'US-SPOOFED-ID'
      };
      const mockEnvD = { first: () => ({ json: spoofedInvoice }) };
      const mockInputD = {
        all: () => [{
          json: {
            po_number: 'PO-2026-004',
            vendor_tax_id: 'US-77382910',
            total_amount: '3240.00'
          }
        }]
      };
      const resD = evalFuncD(mockInputD, () => mockEnvD, defaultEnv);
      assert(resD[0].json.decision === 'SECURITY_ALERT', 'Security Gate: Vendor Tax ID mismatch flags immediate fraud alert');
    }

    // Scenario E: Duplicate invoice detection -> DUPLICATE_REJECTED
    {
      const evalFuncE = new Function('$input', '$', '$env', evalToleranceCode);
      const mockEnvE = { first: () => ({ json: mathResult[0].json }) };
      const mockInputE = {
        all: () => [{
          json: {
            po_number: 'PO-2026-001',
            vendor_tax_id: 'US-94281901',
            total_amount: '1620.00',
            existing_invoice_status: 'AUTO_APPROVED'
          }
        }]
      };
      const resE = evalFuncE(mockInputE, () => mockEnvE, defaultEnv);
      assert(resE[0].json.decision === 'DUPLICATE_REJECTED', 'Duplicate Prevention: already settled invoice blocked from reprocessing');
    }

    // Scenario F: Line-item SKU mismatch detection
    {
      const evalFuncF = new Function('$input', '$', '$env', evalToleranceCode);
      const mismatchedItemInvoice = {
        ...mathResult[0].json,
        total_amount: 1500.00,
        line_items: [{ sku: 'UNEXPECTED-UNLISTED-SKU', quantity: 1, unit_price: 1500.00 }]
      };
      const mockEnvF = { first: () => ({ json: mismatchedItemInvoice }) };
      const mockInputF = {
        all: () => [{
          json: {
            po_number: 'PO-2026-001',
            vendor_tax_id: 'US-94281901',
            total_amount: '1500.00',
            po_items: [{ sku: 'CLOUD-SUB-M', quantity: 1, unit_price: 1000.00 }]
          }
        }]
      };
      const resF = evalFuncF(mockInputF, () => mockEnvF, defaultEnv);
      assert(resF[0].json.decision === 'REQUIRE_HUMAN_APPROVAL', 'Line-item gate: unexpected SKU triggers human review');
      assert(resF[0].json.line_discrepancies.length > 0, 'Line discrepancies documented in evaluation output');
    }

    // Scenario G: Slack Callback Action Parser (Approved)
    {
      const callbackCode = wf1.nodes.find(n => n.name === 'Parse Slack Callback Action').parameters.jsCode;
      const callbackFunc = new Function('$input', 'require', callbackCode);
      const mockSlackReq = {
        item: {
          json: {
            actions: [{
              action_id: 'action_approve_invoice',
              value: JSON.stringify({ token: 'tok_sample', invoice_number: 'INV-2026-0012', action: 'approve', expires_at: new Date(Date.now() + 3600000).toISOString() })
            }],
            user: { username: 'alexandr.motologa' }
          }
        }
      };
      const cbRes = callbackFunc(mockSlackReq, require);
      assert(cbRes[0].json.status === 'MANUALLY_APPROVED', 'Slack Callback parses approval button action to MANUALLY_APPROVED');
      assert(cbRes[0].json.decision_by === 'alexandr.motologa', 'Slack Callback extracts approver identity');
    }

    // Scenario H: Slack Callback Token Expiration (Expired)
    {
      const callbackCode = wf1.nodes.find(n => n.name === 'Parse Slack Callback Action').parameters.jsCode;
      const callbackFunc = new Function('$input', 'require', callbackCode);
      const expiredSlackReq = {
        item: {
          json: {
            actions: [{
              action_id: 'action_approve_invoice',
              value: JSON.stringify({ token: 'tok_sample', invoice_number: 'INV-2026-0012', action: 'approve', expires_at: '2020-01-01T00:00:00.000Z' })
            }],
            user: { username: 'alexandr.motologa' }
          }
        }
      };
      const expiredRes = callbackFunc(expiredSlackReq, require);
      assert(expiredRes[0].json.status === 'EXPIRED', 'Slack Callback flags expired approval token');
      assert(expiredRes[0].json.is_expired === true, 'is_expired boolean is true');
    }
  }

  console.log('\n[Suite 3: Workflow 2 (Lead Enrichment & ICP Rubric Engine)]');
  {
    const wf2Path = path.resolve(__dirname, '../workflows/02-lead-enrichment/workflow.json');
    const wf2 = JSON.parse(fs.readFileSync(wf2Path, 'utf8'));

    const sanitizeCode = wf2.nodes.find(n => n.name === 'Sanitize & Normalize Lead Input').parameters.jsCode;
    const sanitizeFunc = new Function('$input', sanitizeCode);
    const sanitizedRes = sanitizeFunc({
      item: {
        json: {
          contact_name: 'Elena Rostova',
          contact_email: 'e.rostova@finscale-analytics.com',
          company_name: 'FinScale Analytics',
          domain: 'https://www.finscale-analytics.com/about',
          notes: 'Managing complex financial transactions and ledger verification. Needs n8n orchestrations.'
        }
      }
    });
    assert(sanitizedRes[0].json.domain === 'finscale-analytics.com', 'Domain normalizer strips protocol and URL path');

    const enrichCode = wf2.nodes.find(n => n.name === 'Enrich Company Intelligence').parameters.jsCode;
    const enrichFunc = new Function('$input', enrichCode);
    const enrichedRes = enrichFunc({ item: { json: sanitizedRes[0].json } });
    assert(enrichedRes[0].json.enrichment.industry.includes('Financial Technology'), 'Company intelligence identifies FinTech industry');

    const scoreCode = wf2.nodes.find(n => n.name === 'Score Lead against ICP Rubric').parameters.jsCode;
    const scoreFunc = new Function('$input', scoreCode);
    const scoreRes = scoreFunc({ item: { json: enrichedRes[0].json } });
    assert(scoreRes[0].json.icp_score >= 80, `High ICP Lead scores above 80 threshold (got ${scoreRes[0].json.icp_score})`);
    assert(scoreRes[0].json.is_qualified === true, 'High ICP Lead marked as qualified');

    // Test Low ICP Lead (Dave's Handyman)
    const lowSanitized = sanitizeFunc({
      item: {
        json: {
          contact_name: 'Dave Miller',
          contact_email: 'dave@daves-local-handyman.net',
          company_name: "Dave's Local Handyman",
          domain: 'daves-local-handyman.net',
          notes: 'Interested in a simple form to send SMS.'
        }
      }
    });
    const lowEnriched = enrichFunc({ item: { json: lowSanitized[0].json } });
    const lowScored = scoreFunc({ item: { json: lowEnriched[0].json } });
    assert(lowScored[0].json.icp_score < 60, `Non-target lead scores below 60 threshold (got ${lowScored[0].json.icp_score})`);
    assert(lowScored[0].json.is_qualified === false, 'Non-target lead disqualified from sales outreach');

    // Test Outreach Drafter
    const draftCode = wf2.nodes.find(n => n.name === 'Draft Contextual Outreach Email').parameters.jsCode;
    const draftFunc = new Function('$input', draftCode);
    const draftRes = draftFunc({ item: { json: scoreRes[0].json } });
    assert(draftRes[0].json.email_draft.subject_lines.length === 3, 'Outreach Drafter generates 3 distinct subject lines');
    assert(draftRes[0].json.email_draft.body.includes('FinScale Analytics'), 'Outreach Drafter personalizes email with company name');
    assert(!draftRes[0].json.email_draft.body.includes('synergy') && !draftRes[0].json.email_draft.body.includes('game-changer'), 'Humanizer enforced: zero buzzwords in outreach copy');
  }

  console.log('\n[Suite 4: Workflow 3 (Continuous RAG Knowledge Ingestion & Support)]');
  {
    const wf3Path = path.resolve(__dirname, '../workflows/03-rag-support-copilot/workflow.json');
    const wf3 = JSON.parse(fs.readFileSync(wf3Path, 'utf8'));

    // Test Semantic Markdown Chunker
    const chunkerCode = wf3.nodes.find(n => n.name === 'Semantic Markdown Chunker').parameters.jsCode;
    const chunkerFunc = new Function('$input', chunkerCode);

    const slaDocPath = path.resolve(__dirname, '../workflows/03-rag-support-copilot/seed_knowledge_base/enterprise_sla.md');
    const rawSlaText = fs.readFileSync(slaDocPath, 'utf8');

    const chunks = chunkerFunc({
      item: {
        json: {
          doc_id: 'enterprise_sla',
          doc_title: 'Enterprise Service Level Agreement (SLA)',
          category: 'SLA',
          content: rawSlaText
        }
      }
    });

    assert(chunks.length >= 3, `Semantic chunker split markdown into ${chunks.length} sections by headers`);
    assert(chunks.some(c => c.json.section_title.includes('Uptime commitment')), 'Chunker extracted Uptime commitment section');
    assert(chunks.some(c => c.json.section_title.includes('Incident response tiers')), 'Chunker extracted Incident response tiers section');

    // Test Grounding & Confidence Evaluator
    const evalRAGCode = wf3.nodes.find(n => n.name === 'Evaluate Grounding & Confidence').parameters.jsCode;
    const evalRAGFunc = new Function('$input', '$', evalRAGCode);

    // Case 1: High confidence factual answer
    {
      const mockEnvFactual = {
        first: () => ({ json: { query: 'What is our uptime guarantee for P1 incidents?' } })
      };
      const mockChunksFactual = {
        all: () => [
          { json: { doc_title: 'Enterprise SLA', section_title: 'Uptime', similarity: 0.93 } }
        ]
      };
      const factualRes = evalRAGFunc(mockChunksFactual, () => mockEnvFactual);
      assert(factualRes[0].json.requires_escalation === false, 'High confidence query (similarity 0.93) does not trigger escalation');
      assert(factualRes[0].json.confidence_score === 0.93, 'Confidence score accurately captured');
    }

    // Case 2: Escalation keyword trigger (cancellation dispute)
    {
      const mockEnvDispute = {
        first: () => ({ json: { query: 'I want to cancel my account and dispute charge on my invoice' } })
      };
      const mockChunksDispute = {
        all: () => [
          { json: { doc_title: 'Billing Policy', section_title: 'Disputes', similarity: 0.88 } }
        ]
      };
      const disputeRes = evalRAGFunc(mockChunksDispute, () => mockEnvDispute);
      assert(disputeRes[0].json.requires_escalation === true, 'Dispute / cancellation inquiry triggers human escalation gate');
    }

    // Case 3: RAG Feedback Webhook node existence
    const feedbackNode = wf3.nodes.find(n => n.name === 'RAG Feedback Webhook');
    assert(feedbackNode !== undefined, 'RAG Feedback Webhook endpoint configured in workflow');
  }

  console.log('\n[Suite 5: Reusable Sub-Workflows Verification]');
  {
    // 1. Error Handler
    const errWfPath = path.resolve(__dirname, '../sub-workflows/error-handler-slack.json');
    const errWf = JSON.parse(fs.readFileSync(errWfPath, 'utf8'));
    const formatErrCode = errWf.nodes.find(n => n.name === 'Format Incident Card').parameters.jsCode;
    const formatErrFunc = new Function('$input', '$env', formatErrCode);

    const errRes = formatErrFunc({
      item: {
        json: {
          execution: {
            id: 'exec_8841',
            lastNodeExecuted: 'Fetch PO from PostgreSQL',
            error: { message: 'Connection timeout after 5000ms' }
          },
          workflow: { id: 'wf_inv_01', name: 'Invoice Auditor' }
        }
      }
    }, { WEBHOOK_URL: 'http://localhost:5678/webhook' });

    assert(errRes[0].json.failed_node === 'Fetch PO from PostgreSQL', 'Error Handler extracts failed node name');
    assert(errRes[0].json.slack_payload.blocks[0].text.text.includes('Failure'), 'Error Handler builds Slack incident card');

    // 2. PII Masking
    const piiWfPath = path.resolve(__dirname, '../sub-workflows/pii-masking-helper.json');
    const piiWf = JSON.parse(fs.readFileSync(piiWfPath, 'utf8'));
    const piiScrubCode = piiWf.nodes.find(n => n.name === 'Regex Scrub Sensitive Patterns').parameters.jsCode;
    const piiScrubFunc = new Function('$input', 'require', piiScrubCode);

    const sensitiveSample = 'Contact client John Doe at john.doe@enterprise-corp.com or +1 (415) 555-0199. Tax ID: 12-3456789. Card: 4111111111111234';
    const piiRes = piiScrubFunc({ item: { json: { text: sensitiveSample } } }, require);

    assert(!piiRes[0].json.sanitized_text.includes('john.doe@enterprise-corp.com'), 'PII Masking scrubs email address');
    assert(!piiRes[0].json.sanitized_text.includes('415) 555-0199'), 'PII Masking scrubs phone number');
    assert(!piiRes[0].json.sanitized_text.includes('12-3456789'), 'PII Masking scrubs Tax ID / SSN');
    assert(!piiRes[0].json.sanitized_text.includes('4111111111111234'), 'PII Masking scrubs credit card number');
    assert(piiRes[0].json.tokens_masked_count === 4, 'PII Masking identifies all 4 sensitive entities');
    assert(Object.keys(piiRes[0].json.mapping_dictionary).length === 4, 'Mapping dictionary retains token lookup keys');

    // 3. Exponential Backoff & Retry
    const retryWfPath = path.resolve(__dirname, '../sub-workflows/retry-with-backoff.json');
    const retryWf = JSON.parse(fs.readFileSync(retryWfPath, 'utf8'));
    const backoffCode = retryWf.nodes.find(n => n.name === 'Calculate Backoff Schedule').parameters.jsCode;
    const backoffFunc = new Function('$input', backoffCode);
    const retryRes = backoffFunc({
      item: {
        json: {
          target_url: 'https://api.erp.internal/pay',
          max_retries: 3,
          initial_delay_ms: 500
        }
      }
    });
    assert(retryRes[0].json.retry_schedule.length === 3, 'Retry sub-workflow generates 3 backoff schedules');
    assert(retryRes[0].json.retry_schedule[1].delay_ms >= 1000, 'Exponential backoff increases delay per attempt');
  }

  // Close mock server
  server.close();

  console.log('\n----------------------------------------');
  console.log(`TEST SUMMARY: ${passedTests} passed, ${failedTests} failed.`);
  if (failedTests === 0) {
    console.log('ALL WORKFLOWS AND INTEGRATIONS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  } else {
    console.error(`TEST SUITE FAILED with ${failedTests} failure(s).\n`);
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
