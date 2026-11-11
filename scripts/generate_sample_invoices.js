const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function createInvoicePdf({ filename, vendor, taxId, invoiceNum, poRef, date, items, subtotal, tax, total }) {
  const dir = path.dirname(filename);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const writeStream = fs.createWriteStream(filename);
  doc.pipe(writeStream);

  // Header
  doc.fillColor('#1e293b')
     .fontSize(22)
     .font('Helvetica-Bold')
     .text('COMMERCIAL INVOICE', 50, 50);

  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#64748b')
     .text(`Invoice Number: ${invoiceNum}`, 50, 80)
     .text(`Invoice Date: ${date}`, 50, 95)
     .text(`PO Reference: ${poRef}`, 50, 110);

  // Vendor & Tax Box
  doc.roundedRect(320, 50, 225, 75, 4)
     .strokeColor('#cbd5e1')
     .stroke();

  doc.fillColor('#0f172a')
     .fontSize(11)
     .font('Helvetica-Bold')
     .text(vendor, 330, 60);

  doc.fontSize(9)
     .font('Helvetica')
     .fillColor('#475569')
     .text(`Tax ID / EIN: ${taxId}`, 330, 80)
     .text('Enterprise Vendor Services', 330, 95);

  // Table Header
  const tableTop = 150;
  doc.rect(50, tableTop, 495, 24).fill('#f1f5f9');

  doc.fillColor('#334155')
     .fontSize(9)
     .font('Helvetica-Bold')
     .text('SKU', 60, tableTop + 7)
     .text('Description', 140, tableTop + 7)
     .text('Qty', 350, tableTop + 7, { width: 40, align: 'right' })
     .text('Unit Price', 400, tableTop + 7, { width: 60, align: 'right' })
     .text('Total', 475, tableTop + 7, { width: 60, align: 'right' });

  // Table Rows
  let y = tableTop + 28;
  doc.font('Helvetica').fontSize(9).fillColor('#1e293b');

  for (const item of items) {
    doc.text(item.sku, 60, y)
       .text(item.description, 140, y, { width: 200 })
       .text(item.quantity.toString(), 350, y, { width: 40, align: 'right' })
       .text(`$${item.unitPrice.toFixed(2)}`, 400, y, { width: 60, align: 'right' })
       .text(`$${item.total.toFixed(2)}`, 475, y, { width: 60, align: 'right' });
    y += 24;
  }

  // Divider
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#e2e8f0').stroke();
  y += 15;

  // Summary Box
  const summaryX = 350;
  doc.fontSize(9).font('Helvetica');
  doc.text('Subtotal:', summaryX, y, { width: 100, align: 'right' })
     .text(`$${subtotal.toFixed(2)}`, 460, y, { width: 75, align: 'right' });
  y += 18;

  doc.text('Tax / VAT (8%):', summaryX, y, { width: 100, align: 'right' })
     .text(`$${tax.toFixed(2)}`, 460, y, { width: 75, align: 'right' });
  y += 18;

  doc.rect(340, y - 4, 205, 24).fill('#0f172a');
  doc.fillColor('#ffffff').font('Helvetica-Bold')
     .text('Total Due:', summaryX, y + 2, { width: 100, align: 'right' })
     .text(`$${total.toFixed(2)}`, 460, y + 2, { width: 75, align: 'right' });

  // Footer
  doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
     .text('System Generated Invoice for Enterprise Automated Reconciliation', 50, 750, { align: 'center', width: 495 });

  doc.end();

  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => {
      console.log(`Generated: ${filename}`);
      resolve();
    });
    writeStream.on('error', reject);
  });
}

async function main() {
  const baseDir = path.resolve(__dirname, '..', 'workflows', '01-invoice-auditor');

  // 1. Clean Auto-Approve Invoice
  await createInvoicePdf({
    filename: path.join(baseDir, 'mock_invoice_clean.pdf'),
    vendor: 'Acme Cloud Solutions LLC',
    taxId: 'US-94281901',
    invoiceNum: 'INV-2026-0012',
    poRef: 'PO-2026-001',
    date: '2026-11-11',
    items: [
      { sku: 'CLOUD-SUB-M', description: 'Monthly Cloud Hosting Tier M', quantity: 1, unitPrice: 1000.00, total: 1000.00 },
      { sku: 'SUPP-PREM', description: 'Premium 24/7 SLA Support', quantity: 1, unitPrice: 500.00, total: 500.00 }
    ],
    subtotal: 1500.00,
    tax: 120.00,
    total: 1620.00
  });

  // 2. High Value Invoice (Triggers Human-in-the-Loop)
  await createInvoicePdf({
    filename: path.join(baseDir, 'mock_invoice_high_value.pdf'),
    vendor: 'Global Logistics Partners Inc',
    taxId: 'US-88391024',
    invoiceNum: 'INV-2026-0921',
    poRef: 'PO-2026-002',
    date: '2026-11-10',
    items: [
      { sku: 'FRT-AIR-EXP', description: 'International Express Air Freight', quantity: 4, unitPrice: 2500.00, total: 10000.00 },
      { sku: 'CUST-CLEAR', description: 'Customs Clearance Handling', quantity: 4, unitPrice: 500.00, total: 2000.00 }
    ],
    subtotal: 12000.00,
    tax: 960.00,
    total: 12960.00
  });

  // 3. Discrepancy Invoice (5% variance above PO)
  await createInvoicePdf({
    filename: path.join(baseDir, 'mock_invoice_discrepancy.pdf'),
    vendor: 'CloudScale Technologies',
    taxId: 'US-11029482',
    invoiceNum: 'INV-2026-8841',
    poRef: 'PO-2026-003',
    date: '2026-11-09',
    items: [
      { sku: 'DEV-ENV-POD', description: 'Kubernetes Dedicated Dev Pod', quantity: 2, unitPrice: 435.00, total: 870.00 }
    ],
    subtotal: 870.00,
    tax: 69.60,
    total: 939.60
  });
}

if (require.main === module) {
  main().catch(err => {
    console.error('Failed to generate PDF invoices:', err);
    process.exit(1);
  });
}

module.exports = { createInvoicePdf };
