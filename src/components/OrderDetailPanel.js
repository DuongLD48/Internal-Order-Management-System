function valueOrFallback(value) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

function renderProductItems(order) {
  const wrapper = document.createElement('div');
  wrapper.className = 'product-items-list';

  const items = order?.productItems ?? [];

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'detail-empty';
    empty.textContent = 'No product items found.';
    wrapper.appendChild(empty);
    return wrapper;
  }

  items.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'product-item-card';
    card.innerHTML = `
      <div class="product-item-card__top">
        <strong>${index + 1}. ${valueOrFallback(item.name)}</strong>
        <span class="item-status-pill item-status-pill--${item.status || 'pending'}">${valueOrFallback(item.status || 'pending')}</span>
      </div>
    `;
    wrapper.appendChild(card);
  });

  return wrapper;
}

export function renderOrderDetailPanel({ order }) {
  const card = document.createElement('article');
  card.className = 'panel';

  if (!order) {
    card.innerHTML = `
      <h3>Order Detail</h3>
      <p>Select an order row to inspect the current document data. Full drawer and logs arrive in Phase 5.</p>
      <div class="detail-empty">No order selected.</div>
    `;
    return card;
  }

  card.innerHTML = `
    <h3>Order Detail</h3>
    <p>Info tab preview for Phase 4. Logs and richer actions will be added in the next phase.</p>
    <div class="detail-grid">
      <div><strong>Order ID</strong><span>${order.orderId}</span></div>
      <div><strong>Tracking ID</strong><span>${order.trackingId}</span></div>
      <div><strong>Date</strong><span>${valueOrFallback(order.date)}</span></div>
      <div><strong>Status</strong><span>${valueOrFallback(order.status)}</span></div>
      <div><strong>Printed</strong><span>${order.isPrintOrder ? `Yes (${order.printCount ?? 0})` : 'No'}</span></div>
      <div><strong>Completed</strong><span>${order.isOrderCompleted ? 'Yes' : 'No'}</span></div>
      <div><strong>Sheet</strong><span>${valueOrFallback(order.importSheetType || order.source)}</span></div>
      <div class="detail-grid__wide"><strong>Product Lines</strong><span>${(order.productLines ?? []).join(', ') || '-'}</span></div>
    </div>
  `;

  card.appendChild(renderProductItems(order));

  return card;
}
