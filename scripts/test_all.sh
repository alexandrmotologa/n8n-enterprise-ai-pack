#!/usr/bin/env bash
set -e

echo "Running Workflow Schema Validator..."
node scripts/validate_workflows.js

echo ""
echo "Running Integration & Unit Test Suite..."
node scripts/test_all.js

echo ""
echo "All enterprise workflows and tests verified successfully!"
