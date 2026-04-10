export function renderImportPreviewTable({ result }) {
  const card = document.createElement('article');
  card.className = 'panel';
  card.innerHTML = `
    <h3>Aggregate Preview</h3>
    <p>Grouped by tracking ID, sorted by order ID, and ready for creation in the next phase.</p>
  `;

  if (!result) {
    const state = document.createElement('div');
    state.className = 'table-state';
    state.textContent = 'No preview data yet.';
    card.appendChild(state);
    return card;
  }

  if (!result.previewRows.length) {
    const state = document.createElement('div');
    state.className = 'table-state';
    state.textContent = 'No aggregate rows available after validation filters.';
    card.appendChild(state);
    return card;
  }

  const wrap = document.createElement('div');
  wrap.className = 'orders-table-wrap';

  const table = document.createElement('table');
  table.className = 'orders-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Tracking ID</th>
        <th>Order ID</th>
        <th>Date</th>
        <th>Product</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  result.previewRows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.trackingId}</td>
      <td>${row.orderId}</td>
      <td>${row.date}</td>
      <td><div class="preview-product-cell">${row.productLines.join('<br />')}</div></td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  card.appendChild(wrap);

  return card;
}
