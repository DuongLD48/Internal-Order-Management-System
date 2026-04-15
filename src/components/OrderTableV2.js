function formatSheetType(order) {
  return order.importSheetType || order.source || '-';
}

function buildTableCopyText(orders) {
  const header = ['Order ID', 'Tracking', 'Date', 'Product', 'Sheet', 'Status'];
  const rows = orders.map((order) => [
    order.orderId || '-',
    order.trackingId || '-',
    order.date || '-',
    (order.productLines ?? []).join(', ') || '-',
    formatSheetType(order),
    order.status || '-'
  ]);

  return [header, ...rows].map((row) => row.join('\t')).join('\n');
}

async function copyText(value) {
  const text = String(value ?? '').trim();

  if (!text || text === '-') {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  return copied;
}

function createCopyButton(value, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-button';
  button.textContent = 'Copy';
  button.setAttribute('aria-label', `Copy ${label}`);
  button.title = `Copy ${label}`;
  button.addEventListener('click', async (event) => {
    event.stopPropagation();

    try {
      const copied = await copyText(value);

      if (!copied) {
        return;
      }

      const original = button.textContent;
      button.textContent = 'Copied';
      button.classList.add('is-copied');
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove('is-copied');
      }, 1200);
    } catch {
      button.textContent = 'Failed';
      button.classList.add('is-error');
      window.setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('is-error');
      }, 1200);
    }
  });
  return button;
}

function createCopyCellContent(value, label) {
  const wrapper = document.createElement('div');
  wrapper.className = 'copy-cell';

  const text = document.createElement('span');
  text.textContent = value || '-';

  wrapper.appendChild(text);
  wrapper.appendChild(createCopyButton(value, label));

  return wrapper;
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

function getSortIndicator(currentSortKey, targetSortKey, direction) {
  if (currentSortKey !== targetSortKey) {
    return '↕';
  }

  return direction === 'asc' ? '↑' : '↓';
}

export function renderOrderTable({
  orders,
  loading,
  error,
  sortKey,
  sortDirection,
  selectedOrderId,
  selectedOrderIds,
  onToggleSort,
  onSelect,
  onToggleSelect,
  onToggleSelectAll
}) {
  const card = document.createElement('article');
  card.className = 'panel';
  const header = document.createElement('div');
  header.className = 'panel-header';

  const titleBlock = document.createElement('div');
  titleBlock.innerHTML = `
    <h3>Orders</h3>
    <p>Click a row to inspect order details. Status colors match the operational state.</p>
  `;

  const copyTableButton = document.createElement('button');
  copyTableButton.type = 'button';
  copyTableButton.className = 'button button--secondary';
  copyTableButton.textContent = 'Copy Table';
  copyTableButton.disabled = loading || Boolean(error) || !orders.length;
  copyTableButton.addEventListener('click', async () => {
    try {
      await copyText(buildTableCopyText(orders));
      const original = copyTableButton.textContent;
      copyTableButton.textContent = 'Copied';
      window.setTimeout(() => {
        copyTableButton.textContent = original;
      }, 1200);
    } catch {
      copyTableButton.textContent = 'Failed';
      window.setTimeout(() => {
        copyTableButton.textContent = 'Copy Table';
      }, 1200);
    }
  });

  header.appendChild(titleBlock);
  header.appendChild(copyTableButton);
  card.appendChild(header);

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
            <span class="orders-table__sort-indicator">${getSortIndicator(sortKey, 'orderId', sortDirection)}</span>
          </button>
        </th>
        <th>Tracking</th>
        <th>
          <button
            type="button"
            class="orders-table__sort-button"
            aria-label="Toggle Date sort"
            title="Toggle Date sort"
          >
            <span>Date</span>
            <span class="orders-table__sort-indicator">${getSortIndicator(sortKey, 'date', sortDirection)}</span>
          </button>
        </th>
        <th>Product</th>
        <th>Sheet</th>
        <th>Status</th>
      </tr>
    </thead>
  `;

  table.querySelector('thead input').addEventListener('change', (event) => {
    onToggleSelectAll?.(event.target.checked);
  });

  const sortButtons = table.querySelectorAll('.orders-table__sort-button');
  sortButtons[0]?.addEventListener('click', () => {
    onToggleSort?.('orderId');
  });
  sortButtons[1]?.addEventListener('click', () => {
    onToggleSort?.('date');
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
      <td class="orders-table__copy-cell"></td>
      <td class="orders-table__copy-cell"></td>
      <td>${order.date}</td>
      <td class="orders-table__products-cell"></td>
      <td>${formatSheetType(order)}</td>
      <td><span class="status-pill status-pill--${order.status}">${order.status}</span></td>
    `;

    row.querySelectorAll('.orders-table__copy-cell')[0].appendChild(
      createCopyCellContent(order.orderId, 'Order ID')
    );
    row.querySelectorAll('.orders-table__copy-cell')[1].appendChild(
      createCopyCellContent(order.trackingId, 'Tracking')
    );
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
