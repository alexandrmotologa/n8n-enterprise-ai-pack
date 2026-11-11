-- n8n Enterprise AI Pack: PostgreSQL & pgvector Schema Initialization

-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Schemas
CREATE SCHEMA IF NOT EXISTS erp;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS rag;
CREATE SCHEMA IF NOT EXISTS audit;

-- ============================================================================
-- ERP SCHEMA (Accounts Payable & 3-Way Matching)
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp.purchase_orders (
    po_number VARCHAR(64) PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL,
    vendor_tax_id VARCHAR(64) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    tax_amount NUMERIC(12, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(32) DEFAULT 'APPROVED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS erp.purchase_order_items (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(64) NOT NULL REFERENCES erp.purchase_orders(po_number) ON DELETE CASCADE,
    sku VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    total_price NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS erp.invoices (
    invoice_number VARCHAR(64) PRIMARY KEY,
    po_number VARCHAR(64) REFERENCES erp.purchase_orders(po_number),
    vendor_name VARCHAR(255) NOT NULL,
    vendor_tax_id VARCHAR(64) NOT NULL,
    invoice_date DATE NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    tax_amount NUMERIC(12, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    variance_pct NUMERIC(6, 3) DEFAULT 0,
    status VARCHAR(32) DEFAULT 'PENDING',
    approval_token VARCHAR(128),
    decision_by VARCHAR(128),
    decision_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS erp.pending_approvals (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(64) NOT NULL REFERENCES erp.invoices(invoice_number),
    token VARCHAR(128) UNIQUE NOT NULL,
    variance_pct NUMERIC(6, 3) NOT NULL,
    requires_executive_signoff BOOLEAN DEFAULT FALSE,
    status VARCHAR(32) DEFAULT 'PENDING',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit.logs (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CRM SCHEMA (Lead Enrichment & Outreach Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm.leads (
    id VARCHAR(64) PRIMARY KEY,
    contact_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    company_size_tier VARCHAR(64),
    industry VARCHAR(128),
    icp_score INT,
    icp_tier VARCHAR(32),
    qualification_rationale TEXT,
    email_draft_subject VARCHAR(255),
    email_draft_body TEXT,
    status VARCHAR(32) DEFAULT 'NEW',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- RAG SCHEMA (Vector Store with pgvector)
-- ============================================================================

CREATE TABLE IF NOT EXISTS rag.document_embeddings (
    id SERIAL PRIMARY KEY,
    doc_id VARCHAR(128) NOT NULL,
    doc_title VARCHAR(255) NOT NULL,
    section_title VARCHAR(255) NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index on vector column for cosine distance
CREATE INDEX IF NOT EXISTS idx_doc_embeddings_cosine
ON rag.document_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 10);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- PO 1: Clean Auto-Approve candidate (< $2,000, 0% variance)
INSERT INTO erp.purchase_orders (po_number, vendor_name, vendor_tax_id, subtotal, tax_amount, total_amount, currency, status)
VALUES ('PO-2026-001', 'Acme Cloud Solutions LLC', 'US-94281901', 1500.00, 120.00, 1620.00, 'USD', 'APPROVED')
ON CONFLICT (po_number) DO NOTHING;

INSERT INTO erp.purchase_order_items (po_number, sku, description, quantity, unit_price, total_price)
VALUES 
    ('PO-2026-001', 'CLOUD-SUB-M', 'Monthly Cloud Hosting Tier M', 1, 1000.00, 1000.00),
    ('PO-2026-001', 'SUPP-PREM', 'Premium 24/7 SLA Support', 1, 500.00, 500.00)
ON CONFLICT DO NOTHING;

-- PO 2: High Value candidate (Total >= $2,000, triggers Human In The Loop approval)
INSERT INTO erp.purchase_orders (po_number, vendor_name, vendor_tax_id, subtotal, tax_amount, total_amount, currency, status)
VALUES ('PO-2026-002', 'Global Logistics Partners Inc', 'US-88391024', 12000.00, 960.00, 12960.00, 'USD', 'APPROVED')
ON CONFLICT (po_number) DO NOTHING;

INSERT INTO erp.purchase_order_items (po_number, sku, description, quantity, unit_price, total_price)
VALUES 
    ('PO-2026-002', 'FRT-AIR-EXP', 'International Express Air Freight', 4, 2500.00, 10000.00),
    ('PO-2026-002', 'CUST-CLEAR', 'Customs Clearance Handling', 4, 500.00, 2000.00)
ON CONFLICT DO NOTHING;

-- PO 3: Variance candidate (Variance exceeds 0.5%, triggers Discrepancy Gate)
INSERT INTO erp.purchase_orders (po_number, vendor_name, vendor_tax_id, subtotal, tax_amount, total_amount, currency, status)
VALUES ('PO-2026-003', 'CloudScale Technologies', 'US-11029482', 800.00, 64.00, 864.00, 'USD', 'APPROVED')
ON CONFLICT (po_number) DO NOTHING;

INSERT INTO erp.purchase_order_items (po_number, sku, description, quantity, unit_price, total_price)
VALUES 
    ('PO-2026-003', 'DEV-ENV-POD', 'Kubernetes Dedicated Dev Pod', 2, 400.00, 800.00)
ON CONFLICT DO NOTHING;

-- PO 4: Security test candidate (Valid PO, used to test tax ID mismatch fraud detection)
INSERT INTO erp.purchase_orders (po_number, vendor_name, vendor_tax_id, subtotal, tax_amount, total_amount, currency, status)
VALUES ('PO-2026-004', 'CyberGuard Defense Systems', 'US-77382910', 3000.00, 240.00, 3240.00, 'USD', 'APPROVED')
ON CONFLICT (po_number) DO NOTHING;

INSERT INTO erp.purchase_order_items (po_number, sku, description, quantity, unit_price, total_price)
VALUES 
    ('PO-2026-004', 'SIEM-LIC-1Y', 'Enterprise SIEM Annual License', 1, 3000.00, 3000.00)
ON CONFLICT DO NOTHING;
