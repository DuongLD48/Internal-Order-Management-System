function formatSheetType(order) {
  return order.importSheetType || order.source || '-';
}

function renderProducts(order) {
  const wrapper = document.createElement('div');
  wrapper.className = 'product-chip-list';

  const items = Array.isArray(order.productItems) && order.productItems.length
    ? order.productItems
    : (order.productLines ?? []).map((name, index) => ({
        id: `fallback_${index + 1}`,
        name,
        status: 'pending'
      }));

  if (!items.length) {
    wrapper.textContent = '-';
    return wrapper;
  }

  items.forEach((item) => {
    const chip = document.createElement('span');
    chip.className = `product-chip product-chip--${item.status || 'pending'}`;
    chip.textContent = item.name;
    wrapper.appendChild(chip);
  });

  return wrapper;
}

export function renderOrderTable({
  orders,
  loading,
  error,
  sortDirection,
  selectedOrderId,
  selectedOrderIds,
  onToggleOrderIdSort,
  onSelect,
  onToggleSelect,
  onToggleSelectAll
}) {
  const card = document.createElement('article');
  card.className = 'panel';

  card.innerHTML = `
    <h3>Orders</h3>
    <p>Click a row to inspect order details. Status colors match the operational state.</p>
  `;

  if (loading) {
    const state = document.createElement('div');
    state.className = 'table-state';
    state.textContent = 'Loading orders...';
    card.appendChild(state);
    return card;
  }

  if (error) {
    const state = document.createElement('div');
    state.className = 'table-state is-error';
    state.textContent = error;
    card.appendChild(state);
    return card;
  }

  if (!orders.length) {
    const state = document.createElement('div');
    state.className = 'table-state';
    state.textContent = 'No orders matched the current filters.';
    card.appendChild(state);
    return card;
  }

  const tableWrap = document.createElement('div');
  tableWrap.className = 'orders-table-wrap';

  const table = document.createElement('table');
  table.className = 'orders-table';
  const selectableIds = orders.map((order) => order.orderId);
  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((orderId) => selectedOrderIds?.has(orderId));
  table.innerHTML = `
    <thead>
      <tr>
        <th class="orders-table__checkbox-cell">
          <input type="checkbox" ${allSelected ? 'checked' : ''} aria-label="Select all visible orders" />
        </th>
        <th>
          <button
            type="button"
            class="orders-table__sort-button"
            aria-label="Toggle Order ID sort"
            title="Toggle Order ID sort"
          >
            <span>Order ID</span>
            <span class="orders-table__sort-indicator">${sortDirection === 'asc' ? '↑' : '↓'}</span>
          </button>
        </th>
        <th>Tracking</th>
        <th>Date</th>
        <th>Product</th>
        <th>Sheet</th>
        <th>Status</th>
      </tr>
    </thead>
  `;

  table.querySelector('thead input').addEventListener('change', (event) => {
    onToggleSelectAll?.(event.target.checked);
  });

  table.querySelector('.orders-table__sort-button')?.addEventListener('click', () => {
    onToggleOrderIdSort?.();
  });

  const tbody = document.createElement('tbody');

  orders.forEach((order) => {
    const isChecked = selectedOrderIds?.has(order.orderId);
    const row = document.createElement('tr');
    row.className = `orders-table__row order-status--${order.status}${selectedOrderId === order.orderId ? ' is-selected' : ''}`;
    row.tabIndex = 0;
    row.innerHTML = `
      <td class="orders-table__checkbox-cell">
        <input type="checkbox" ${isChecked ? 'checked' : ''} aria-label="Select ${order.orderId}" />
      </td>
      <td>${order.orderId}</td>
      <td>${order.trackingId}</td>
      <td>${order.date}</td>
      <td class="orders-table__products-cell"></td>
      <td>${formatSheetType(order)}</td>
      <td><span class="status-pill status-pill--${order.status}">${order.status}</span></td>
    `;

    row.querySelector('.orders-table__products-cell').appendChild(renderProducts(order));

    const selectRow = () => onSelect?.(order);
    const checkbox = row.querySelector('input[type="checkbox"]');

    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    checkbox.addEventListener('change', (event) => {
      onToggleSelect?.(order.orderId, event.target.checked);
    });

    row.addEventListener('click', selectRow);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectRow();
      }
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  card.appendChild(tableWrap);

  return card;
}
