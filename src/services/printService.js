function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizePrintableOrders(orders) {
  return orders.map((order) => ({
    orderId: order.orderId ?? '',
    trackingId: order.trackingId ?? '',
    date: order.date ?? '',
    product: String(
      order.product ??
      (order.productLines ?? []).filter(Boolean).join('\n') ??
      ''
    )
  }));
}

function createPrintHtml(orders, options = {}) {
  const payload = JSON.stringify(normalizePrintableOrders(orders));
  const autoPrint = options.autoPrint !== false;
  const title = options.title ?? 'Order Labels';
  const statusText = autoPrint
    ? `Preparing ${orders.length} label(s)...`
    : `Previewing ${orders.length} label(s). Use your browser print action when ready.`;
  const showToolbar = !autoPrint;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@latest/dist/JsBarcode.all.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { background: #ffffff; }
    body { font-family: Arial, sans-serif; }
    @page { size: 100mm 150mm; margin: 0; }
    #printArea { display: block; }
    .label-page {
      width: 100mm;
      height: 150mm;
      background: white;
      padding: 8mm;
      position: relative;
      font-family: Arial, sans-serif;
      box-sizing: border-box;
      overflow: hidden;
      page-break-after: always;
      page-break-inside: avoid;
    }
    .label-page:last-child { page-break-after: auto; }
    .label-date {
      text-align: right;
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 3mm;
      color: #000;
    }
    .code-container {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 3mm;
    }
    .barcode-container {
      flex: 1;
      text-align: left;
      margin-right: 5mm;
      height: 70px;
      overflow: hidden;
    }
    .barcode-container svg {
      height: 70px !important;
      width: auto !important;
      display: block;
    }
    .qr-container { flex: 0 0 70px; }
    .qr-container canvas {
      width: 70px !important;
      height: 70px !important;
    }
    .tracking-number {
      font-size: 14px;
      font-weight: bold;
      text-align: left;
      word-break: break-all;
      margin-bottom: 3mm;
      color: #000;
    }
    .order-id-line {
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 3mm;
      word-break: break-all;
      color: #000;
    }
    .invoice-box {
      border: 2px dashed #000;
      padding: 5mm;
      margin-top: 3mm;
    }
    .invoice-title {
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 2mm;
      text-transform: uppercase;
      color: #000;
    }
    .invoice-product {
      font-size: 14px;
      font-weight: bold;
      text-align: center;
      letter-spacing: 1px;
      line-height: 1.5;
      white-space: pre-line;
      color: #000;
    }
    .print-status {
      padding: 12px 16px;
      font: 14px/1.4 Arial, sans-serif;
      color: #333;
    }
    .preview-toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      background: #111827;
      color: #f9fafb;
      font: 14px/1.4 Arial, sans-serif;
    }
    .preview-toolbar__actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .preview-toolbar button {
      min-height: 40px;
      padding: 0 14px;
      border: 1px solid transparent;
      border-radius: 10px;
      font: 700 14px/1 Arial, sans-serif;
      cursor: pointer;
    }
    .preview-toolbar .primary {
      background: #22c55e;
      color: #0b1220;
    }
    .preview-toolbar .secondary {
      background: transparent;
      color: #f9fafb;
      border-color: rgba(255, 255, 255, 0.2);
    }
    @media print {
      .print-status,
      .preview-toolbar { display: none !important; }
    }
  </style>
</head>
<body>
  ${showToolbar ? `<div class="preview-toolbar">
    <div>
      <strong>Label Preview</strong>
      <div>Ready to print ${orders.length} label(s).</div>
    </div>
    <div class="preview-toolbar__actions">
      <button type="button" class="secondary" onclick="window.close()">Close</button>
      <button type="button" class="primary" onclick="window.focus(); window.print()">Print Now</button>
    </div>
  </div>` : ''}
  <div class="print-status">${statusText}</div>
  <div id="printArea"></div>
  <script>
    const rows = ${payload};
    const autoPrint = ${autoPrint ? 'true' : 'false'};
    const printArea = document.getElementById('printArea');

    rows.forEach((data, index) => {
      const page = document.createElement('div');
      page.className = 'label-page';

      const barcodeId = 'bc_' + index;
      const qrId = 'qr_' + index;
      const orderLine = data.orderId
        ? '<div class="order-id-line">Order ID: ' + data.orderId + '</div>'
        : '';

      page.innerHTML = [
        '<div class="label-date">' + data.date + '</div>',
        '<div class="code-container">',
          '<div class="barcode-container"><svg id="' + barcodeId + '"></svg></div>',
          '<div class="qr-container"><div id="' + qrId + '"></div></div>',
        '</div>',
        '<div class="tracking-number">Tracking: ' + data.trackingId + '</div>',
        orderLine,
        '<div class="invoice-box">',
          '<div class="invoice-title">PRODUCT</div>',
          '<div class="invoice-product">' + data.product + '</div>',
        '</div>'
      ].join('');

      printArea.appendChild(page);
    });

    const renderCodes = () => {
      rows.forEach((data, index) => {
        try {
          JsBarcode('#bc_' + index, data.trackingId, {
            format: 'CODE128',
            width: 2,
            height: 70,
            displayValue: false,
            margin: 0,
            flat: true,
            background: '#ffffff'
          });
        } catch (error) {
          console.error('Barcode render failed', data.trackingId, error);
        }

        try {
          const qrEl = document.getElementById('qr_' + index);
          qrEl.innerHTML = '';
          new QRCode(qrEl, {
            text: data.trackingId,
            width: 70,
            height: 70,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
          });
        } catch (error) {
          console.error('QR render failed', data.trackingId, error);
        }
      });

      if (autoPrint) {
        setTimeout(() => {
          window.focus();
          window.print();
        }, 800);
      }
    };

    window.addEventListener('load', () => {
      renderCodes();
    });

    window.addEventListener('afterprint', () => {
      setTimeout(() => window.close(), 150);
    });
  </script>
</body>
</html>`;
}

export function openPrintWindow(orders) {
  if (!Array.isArray(orders) || !orders.length) {
    throw new Error('No orders available for printing.');
  }

  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    throw new Error('Print window was blocked. Please allow pop-ups for this app.');
  }

  printWindow.document.open();
  printWindow.document.write(createPrintHtml(orders.map((order) => ({
    orderId: escapeHtml(order.orderId),
    trackingId: escapeHtml(order.trackingId),
    date: escapeHtml(order.date),
    product: escapeHtml((order.productLines ?? []).filter(Boolean).join('\n'))
  }))));
  printWindow.document.close();

  return printWindow;
}

export function openPrintPreviewWindow(orders) {
  if (!Array.isArray(orders) || !orders.length) {
    throw new Error('No orders available for print preview.');
  }

  const previewWindow = window.open('', '_blank');

  if (!previewWindow) {
    throw new Error('Preview window was blocked. Please allow pop-ups for this app.');
  }

  previewWindow.document.open();
  previewWindow.document.write(createPrintHtml(
    orders.map((order) => ({
      orderId: escapeHtml(order.orderId),
      trackingId: escapeHtml(order.trackingId),
      date: escapeHtml(order.date),
      product: escapeHtml((order.productLines ?? []).filter(Boolean).join('\n'))
    })),
    {
      autoPrint: false,
      title: 'Order Label Preview'
    }
  ));
  previewWindow.document.close();

  return previewWindow;
}
