# PowerShell Test Runner for n8n Enterprise AI Pack
$ErrorActionPreference = "Stop"

Write-Host "Running Workflow Schema Validator..." -ForegroundColor Cyan
node scripts/validate_workflows.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "Workflow Schema Validation Failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`nRunning Integration & Unit Test Suite..." -ForegroundColor Cyan
node scripts/test_all.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "Integration Tests Failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`nAll enterprise workflows and tests verified successfully!" -ForegroundColor Green
exit 0
