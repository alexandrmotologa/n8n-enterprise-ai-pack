-- Seed Purchase Orders and Items for 3-Way Matching Workflow Verification

INSERT INTO erp.purchase_orders (po_number, vendor_name, vendor_tax_id, subtotal, tax_amount, total_amount, currency, status)
VALUES 
    ('PO-2026-001', 'Acme Cloud Solutions LLC', 'US-94281901', 1500.00, 120.00, 1620.00, 'USD', 'APPROVED'),
    ('PO-2026-002', 'Global Logistics Partners Inc', 'US-88391024', 12000.00, 960.00, 12960.00, 'USD', 'APPROVED'),
    ('PO-2026-003', 'CloudScale Technologies', 'US-11029482', 800.00, 64.00, 864.00, 'USD', 'APPROVED'),
    ('PO-2026-004', 'CyberGuard Defense Systems', 'US-77382910', 3000.00, 240.00, 3240.00, 'USD', 'APPROVED')
ON CONFLICT (po_number) DO UPDATE 
SET vendor_name = EXCLUDED.vendor_name,
    vendor_tax_id = EXCLUDED.vendor_tax_id,
    subtotal = EXCLUDED.subtotal,
    tax_amount = EXCLUDED.tax_amount,
    total_amount = EXCLUDED.total_amount;

DELETE FROM erp.purchase_order_items WHERE po_number IN ('PO-2026-001', 'PO-2026-002', 'PO-2026-003', 'PO-2026-004');

INSERT INTO erp.purchase_order_items (po_number, sku, description, quantity, unit_price, total_price)
VALUES 
    ('PO-2026-001', 'CLOUD-SUB-M', 'Monthly Cloud Hosting Tier M', 1, 1000.00, 1000.00),
    ('PO-2026-001', 'SUPP-PREM', 'Premium 24/7 SLA Support', 1, 500.00, 500.00),
    ('PO-2026-002', 'FRT-AIR-EXP', 'International Express Air Freight', 4, 2500.00, 10000.00),
    ('PO-2026-002', 'CUST-CLEAR', 'Customs Clearance Handling', 4, 500.00, 2000.00),
    ('PO-2026-003', 'DEV-ENV-POD', 'Kubernetes Dedicated Dev Pod', 2, 400.00, 800.00),
    ('PO-2026-004', 'SIEM-LIC-1Y', 'Enterprise SIEM Annual License', 1, 3000.00, 3000.00);
