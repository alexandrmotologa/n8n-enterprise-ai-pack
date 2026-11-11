const fs = require('fs');
const path = require('path');

const workflowFiles = [
  'workflows/01-invoice-auditor/workflow.json',
  'workflows/02-lead-enrichment/workflow.json',
  'workflows/03-rag-support-copilot/workflow.json',
  'sub-workflows/error-handler-slack.json',
  'sub-workflows/pii-masking-helper.json'
];

let totalErrors = 0;

console.log('=== n8n Enterprise Workflow Schema Validator ===\n');

for (const relPath of workflowFiles) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  console.log(`Checking ${relPath}...`);

  if (!fs.existsSync(fullPath)) {
    console.error(`  FAIL: File does not exist at ${fullPath}`);
    totalErrors++;
    continue;
  }

  let content;
  try {
    content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (err) {
    console.error(`  FAIL: Invalid JSON syntax: ${err.message}`);
    totalErrors++;
    continue;
  }

  // 1. Top-level attributes
  if (!content.name || typeof content.name !== 'string') {
    console.error('  FAIL: Missing or invalid "name" attribute');
    totalErrors++;
  }
  if (!Array.isArray(content.nodes) || content.nodes.length === 0) {
    console.error('  FAIL: Missing or empty "nodes" array');
    totalErrors++;
  }
  if (!content.connections || typeof content.connections !== 'object') {
    console.error('  FAIL: Missing or invalid "connections" object');
    totalErrors++;
  }

  // 2. Validate Nodes
  const nodeNames = new Set();
  const nodeIds = new Set();

  for (const node of content.nodes || []) {
    if (!node.id) {
      console.error(`  FAIL: Node missing "id" property`);
      totalErrors++;
    } else if (nodeIds.has(node.id)) {
      console.error(`  FAIL: Duplicate node id: "${node.id}"`);
      totalErrors++;
    } else {
      nodeIds.add(node.id);
    }

    if (!node.name) {
      console.error(`  FAIL: Node missing "name" property`);
      totalErrors++;
    } else if (nodeNames.has(node.name)) {
      console.error(`  FAIL: Duplicate node name: "${node.name}"`);
      totalErrors++;
    } else {
      nodeNames.add(node.name);
    }

    if (!node.type || typeof node.type !== 'string') {
      console.error(`  FAIL: Node "${node.name}" missing valid "type"`);
      totalErrors++;
    }

    if (!Array.isArray(node.position) || node.position.length !== 2) {
      console.error(`  FAIL: Node "${node.name}" missing valid [x, y] "position"`);
      totalErrors++;
    }
  }

  // 3. Validate Connections
  for (const [sourceNode, connectionConfig] of Object.entries(content.connections || {})) {
    if (!nodeNames.has(sourceNode)) {
      console.error(`  FAIL: Connection references nonexistent source node: "${sourceNode}"`);
      totalErrors++;
    }

    if (connectionConfig.main && Array.isArray(connectionConfig.main)) {
      for (const branch of connectionConfig.main) {
        if (Array.isArray(branch)) {
          for (const target of branch) {
            if (!nodeNames.has(target.node)) {
              console.error(`  FAIL: Source node "${sourceNode}" connects to nonexistent target node: "${target.node}"`);
              totalErrors++;
            }
          }
        }
      }
    }
  }

  console.log(`  PASS: Valid n8n workflow (${content.nodes.length} nodes, ${Object.keys(content.connections).length} connections)`);
}

console.log('\n----------------------------------------');
if (totalErrors === 0) {
  console.log('ALL WORKFLOW SCHEMAS VALIDATED SUCCESSFULLY (0 errors)\n');
  process.exit(0);
} else {
  console.error(`VALIDATION FAILED with ${totalErrors} error(s)\n`);
  process.exit(1);
}
