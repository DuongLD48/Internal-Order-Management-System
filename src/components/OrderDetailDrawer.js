import { PERMISSIONS } from '../constants/permissions.js';
import { hasPermission } from '../guards/roleGuard.js';

function valueOrFallback(value) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString();
}

function formatValue(value, field) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (
    field === 'lastPrintedAt' ||
    field === 'createdAt' ||
    field === 'updatedAt' ||
    field === 'warehouseCheckedAt' ||
    field === 'fulfilledAt'
  ) {
    return formatDateTime(value);
  }

  if (field === 'productLines' && Array.isArray(value)) {
    return value.join(', ') || '-';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'object') {
    if (value.email) {
      return value.email;
    }

    return '-';
  }

  return String(value);
}

function getActionLabel(action) {
  const labels = {
    CREATE_ORDER: 'Created order',
    CREATE_ORDER_FROM_IMPORT: 'Created order from import',
    UPDATE_ORDER: 'Updated order',
    UPDATE_PRODUCT_ITEM: 'Updated product item',
    PRINT_ORDER: 'Printed order',
    REPRINT_ORDER: 'Reprinted order',
    COMPLETE_ORDER: 'Completed order',
    CANCEL_ORDER: 'Cancelled order',
    REOPEN_ORDER: 'Reopened order',
    RESTORE_ORDER: 'Restored order',
    IMPORT_PREVIEW: 'Previewed import',
    IMPORT_VALIDATION_FAILED: 'Import validation failed'
  };

  return labels[action] || action || 'Unknown action';
}

function getLogSummary(log) {
  const summaries = {
    CREATE_ORDER: 'A new order record was created.',
    CREATE_ORDER_FROM_IMPORT: 'A new order was created from imported Excel data.',
    UPDATE_ORDER: 'Order information was edited and reset to open.',
    UPDATE_PRODUCT_ITEM: 'A single product line was updated for warehouse or fulfillment handling.',
    PRINT_ORDER: 'This order was printed for the first time.',
    REPRINT_ORDER: 'This order was printed again.',
    COMPLETE_ORDER: 'This order was marked as completed.',
    CANCEL_ORDER: 'This order was cancelled without deleting the record.',
    REOPEN_ORDER: 'This order was reopened.',
    RESTORE_ORDER: 'This order was restored.',
    IMPORT_PREVIEW: 'Import preview was generated.',
    IMPORT_VALIDATION_FAILED: 'Import validation found blocking issues.'
  };

  return summaries[log.action] || valueOrFallback(log.note) || 'Order history event recorded.';
}

function buildProductItemChangeRows(log) {
  const beforeItem = log.changes?.beforeItem ?? null;
  const afterItem = log.changes?.afterItem ?? null;

  if (!beforeItem || !afterItem) {
    return [];
  }

  const fieldMap = [
    ['status', 'Item Status'],
    ['warehouseChecked', 'Warehouse Checked'],
    ['warehouseCheckedAt', 'Checked At'],
    ['warehouseCheckedBy', 'Checked By'],
    ['fulfilledAt', 'Fulfilled At'],
    ['fulfilledBy', 'Fulfilled By'],
    ['note', 'Note']
  ];

  return fieldMap
    .map(([field, label]) => {
      const beforeValue = beforeItem[field];
      const afterValue = afterItem[field];
      const changed = JSON.stringify(beforeValue) !== JSON.stringify(afterValue);

      if (!changed) {
        return null;
      }

      return {
        label,
        before: formatValue(beforeValue, field),
        after: formatValue(afterValue, field)
      };
    })
    .filter(Boolean);
}

function getProductItemStatusClass(status) {
  return `item-status-pill--${status || 'pending'}`;
}

function getProductItemStatusLabel(status) {
  const labels = {
    pending: 'Pending',
    ready: 'Ready',
    missing: 'Missing',
    fulfilled: 'Fulfilled',
    completed: 'Completed'
  };

  return labels[status] || 'Pending';
}

function renderProductItemsSection({ order, canManageProductItems, disabled, onUpdateProductItems }) {
  const section = document.createElement('section');
  section.className = 'product-items-section';

  const items = order?.productItems ?? [];
  const totalCount = items.length;
  const readyCount = items.filter((item) => item.status === 'ready').length;
  const missingCount = items.filter((item) => item.status === 'missing').length;
  const fulfilledCount = items.filter((item) => item.status === 'fulfilled').length;
  const completedCount = items.filter((item) => item.status === 'completed').length;

  section.innerHTML = `
    <div class="product-items-section__header">
      <div>
        <h4>Product Items</h4>
        <p>Each product line is now tracked separately so warehouse and office can work on the same order more clearly.</p>
      </div>
      <div class="product-items-summary">
        <span><strong>${totalCount}</strong> total</span>
        <span><strong>${readyCount}</strong> ready</span>
        <span><strong>${missingCount}</strong> missing</span>
        <span><strong>${fulfilledCount}</strong> fulfilled</span>
        <span><strong>${completedCount}</strong> completed</span>
      </div>
    </div>
  `;

  const list = document.createElement('div');
  list.className = 'product-items-list';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'detail-empty';
    empty.textContent = 'No product items found for this order.';
    list.appendChild(empty);
    section.appendChild(list);
    return section;
  }

  items.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'product-item-card';
    card.dataset.itemId = item.id;
    card.innerHTML = `
      <div class="product-item-card__top">
        <strong>${index + 1}. ${valueOrFallback(item.name)}</strong>
        <span class="item-status-pill ${getProductItemStatusClass(item.status)}">${getProductItemStatusLabel(item.status)}</span>
      </div>
    `;

    if (canManageProductItems) {
      const form = document.createElement('form');
      form.className = 'product-item-form product-item-form--compact';
      form.innerHTML = `
        <label class="field">
          <span>Line Status</span>
          <select name="status" ${disabled ? 'disabled' : ''}>
            <option value="pending" ${item.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="ready" ${item.status === 'ready' ? 'selected' : ''}>Ready</option>
            <option value="missing" ${item.status === 'missing' ? 'selected' : ''}>Missing</option>
            <option value="fulfilled" ${item.status === 'fulfilled' ? 'selected' : ''}>Fulfilled</option>
          </select>
        </label>
      `;

      form.querySelector('select[name="status"]').dataset.originalValue = String(item.status ?? '');

      card.appendChild(form);
    }

    list.appendChild(card);
  });

  section.appendChild(list);

  if (canManageProductItems) {
    const actions = document.createElement('div');
    actions.className = 'product-item-form__actions';

    const saveAllButton = document.createElement('button');
    saveAllButton.type = 'button';
    saveAllButton.className = 'button button--secondary';
    saveAllButton.disabled = disabled;
    saveAllButton.textContent = disabled ? 'Saving...' : 'Save All Product Changes';
    saveAllButton.addEventListener('click', async () => {
      const updates = [];

      list.querySelectorAll('.product-item-card').forEach((card) => {
        const itemId = card.dataset.itemId;
        const statusInput = card.querySelector('select[name="status"]');

        if (!itemId || !statusInput) {
          return;
        }

        const nextStatus = String(statusInput.value ?? '');
        const originalStatus = String(statusInput.dataset.originalValue ?? '');

        if (nextStatus !== originalStatus) {
          updates.push({
            itemId,
            status: nextStatus
          });
        }
      });

      await onUpdateProductItems?.(updates);
    });

    actions.appendChild(saveAllButton);
    section.appendChild(actions);
  }

  return section;
}

function buildChangeRows(log) {
  const before = log.changes?.before ?? null;
  const after = log.changes?.after ?? null;

  if (!before && !after) {
    return [];
  }

  const fieldMap = [
    ['status', 'Status'],
    ['isPrintOrder', 'Printed'],
    ['printCount', 'Print Count'],
    ['lastPrintedAt', 'Last Printed'],
    ['isOrderCompleted', 'Completed'],
    ['trackingId', 'Tracking ID'],
    ['orderId', 'Order ID'],
    ['date', 'Date'],
    ['importSheetType', 'Sheet Type'],
    ['productLines', 'Product Lines'],
    ['deleted', 'Deleted'],
    ['version', 'Version'],
    ['updatedBy', 'Updated By']
  ];

  return fieldMap
    .map(([field, label]) => {
      const beforeValue = before ? before[field] : undefined;
      const afterValue = after ? after[field] : undefined;
      const changed = JSON.stringify(beforeValue) !== JSON.stringify(afterValue);

      if (!changed) {
        return null;
      }

      return {
        label,
        before: formatValue(beforeValue, field),
        after: formatValue(afterValue, field)
      };
    })
    .filter(Boolean);
}

export function renderOrderDetailDrawer({
  open,
  detailState,
  actionLoading = false,
  actor,
  printBlockedReason = '',
  onClose,
  onTabChange,
  onEdit,
  onUpdateProductItems,
  onPrint,
  onComplete,
  onCancel
}) {
  const container = document.createElement('div');
  container.className = `drawer-shell${open ? ' is-open' : ''}`;

  if (!open) {
    return container;
  }

  const overlay = document.createElement('button');
  overlay.type = 'button';
  overlay.className = 'drawer-overlay';
  overlay.setAttribute('aria-label', 'Close order detail');
  overlay.addEventListener('click', () => onClose?.());

  const panel = document.createElement('aside');
  panel.className = 'drawer-panel';

  const order = detailState.order;
  const canViewLogs = hasPermission(actor?.role, PERMISSIONS.LOGS_VIEW);

  panel.innerHTML = `
    <div class="drawer-header">
      <div>
        <span class="eyebrow">Order Detail</span>
        <h3>${valueOrFallback(order?.orderId || detailState.orderId)}</h3>
        <p class="page-copy">Live detail view backed by Firestore document + log subcollection.</p>
      </div>
    </div>
  `;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'button button--secondary drawer-close';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => onClose?.());
  panel.querySelector('.drawer-header').appendChild(closeButton);

  const tabs = document.createElement('div');
  tabs.className = 'drawer-tabs';

  const infoTab = document.createElement('button');
  infoTab.type = 'button';
  infoTab.className = `drawer-tab${detailState.activeTab === 'info' ? ' is-active' : ''}`;
  infoTab.textContent = 'Info';
  infoTab.addEventListener('click', () => onTabChange?.('info'));
  tabs.appendChild(infoTab);

  if (canViewLogs) {
    const logsTab = document.createElement('button');
    logsTab.type = 'button';
    logsTab.className = `drawer-tab${detailState.activeTab === 'logs' ? ' is-active' : ''}`;
    logsTab.textContent = 'Logs';
    logsTab.addEventListener('click', () => onTabChange?.('logs'));
    tabs.appendChild(logsTab);
  }

  panel.appendChild(tabs);

  const actionRow = document.createElement('div');
  actionRow.className = 'drawer-actions';

  const canPrint = hasPermission(actor?.role, PERMISSIONS.ORDERS_PRINT);
  const canEdit = hasPermission(actor?.role, PERMISSIONS.ORDERS_EDIT);
  const canManageProductItems = hasPermission(actor?.role, PERMISSIONS.ORDERS_ITEM_UPDATE);
  const canComplete = hasPermission(actor?.role, PERMISSIONS.ORDERS_COMPLETE);
  const canCancel = hasPermission(actor?.role, PERMISSIONS.ORDERS_CANCEL);

  if (canEdit) {
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'button button--secondary';
    editButton.textContent = 'Edit';
    editButton.disabled = detailState.loading || actionLoading || !detailState.order;
    editButton.addEventListener('click', () => onEdit?.(detailState.order));
    actionRow.appendChild(editButton);
  }

  if (canPrint) {
    const printButton = document.createElement('button');
    printButton.type = 'button';
    printButton.className = 'button button--secondary';
    printButton.textContent = detailState.order?.isPrintOrder ? 'Reprint' : 'Print';
    printButton.disabled = detailState.loading || actionLoading || !detailState.order || Boolean(printBlockedReason);
    printButton.addEventListener('click', () => onPrint?.(detailState.order));
    actionRow.appendChild(printButton);
  }

  if (canComplete) {
    const completeButton = document.createElement('button');
    completeButton.type = 'button';
    completeButton.className = 'button button--secondary';
    completeButton.textContent = 'Complete';
    completeButton.disabled =
      detailState.loading ||
      actionLoading ||
      !detailState.order ||
      detailState.order.status === 'completed' ||
      detailState.order.status === 'cancelled';
    completeButton.addEventListener('click', () => onComplete?.(detailState.order));
    actionRow.appendChild(completeButton);
  }

  if (canCancel) {
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'button button--secondary';
    cancelButton.textContent = 'Cancel';
    cancelButton.disabled =
      detailState.loading ||
      actionLoading ||
      !detailState.order ||
      detailState.order.status === 'cancelled' ||
      detailState.order.status === 'completed';
    cancelButton.addEventListener('click', () => onCancel?.(detailState.order));
    actionRow.appendChild(cancelButton);
  }

  if (actionRow.childElementCount > 0) {
    panel.appendChild(actionRow);
  }

  if (printBlockedReason) {
    const lockNote = document.createElement('p');
    lockNote.className = 'import-lock-note';
    lockNote.textContent = printBlockedReason;
    panel.appendChild(lockNote);
  }

  const body = document.createElement('div');
  body.className = 'drawer-body';

  if (detailState.loading) {
    const loading = document.createElement('div');
    loading.className = 'table-state';
    loading.textContent = 'Loading order detail...';
    body.appendChild(loading);
  } else if (detailState.error) {
    const error = document.createElement('div');
    error.className = 'table-state is-error';
    error.textContent = detailState.error;
    body.appendChild(error);
  } else if (!order) {
    const empty = document.createElement('div');
    empty.className = 'detail-empty';
    empty.textContent = 'Order detail is not available.';
    body.appendChild(empty);
  } else if (detailState.activeTab === 'logs' && canViewLogs) {
    if (!detailState.logs.length) {
      const empty = document.createElement('div');
      empty.className = 'detail-empty';
      empty.textContent = 'No logs found for this order.';
      body.appendChild(empty);
    } else {
      const timeline = document.createElement('div');
      timeline.className = 'log-timeline';

      detailState.logs.forEach((log) => {
        const item = document.createElement('article');
        item.className = 'log-card';
        const changes =
          log.action === 'UPDATE_PRODUCT_ITEM'
            ? buildProductItemChangeRows(log)
            : buildChangeRows(log);

        item.innerHTML = `
          <div class="log-card__top">
            <strong>${getActionLabel(log.action)}</strong>
            <span>${formatDateTime(log.createdAt)}</span>
          </div>
          <div class="log-card__meta">
            <span>By: ${valueOrFallback(log.createdBy?.email)}</span>
            <span>${valueOrFallback(log.note) !== '-' ? log.note : getLogSummary(log)}</span>
          </div>
          <div class="log-card__summary">${getLogSummary(log)}</div>
        `;

        if (changes.length) {
          const changeList = document.createElement('div');
          changeList.className = 'log-change-list';

          changes.forEach((change) => {
            const row = document.createElement('div');
            row.className = 'log-change-row';
            row.innerHTML = `
              <strong>${change.label}</strong>
              <div class="log-change-values">
                <span class="log-change-before">${change.before}</span>
                <span class="log-change-arrow">→</span>
                <span class="log-change-after">${change.after}</span>
              </div>
            `;
            changeList.appendChild(row);
          });

          item.appendChild(changeList);
        }

        timeline.appendChild(item);
      });

      body.appendChild(timeline);
    }
  } else {
    const detailGrid = document.createElement('div');
    detailGrid.className = 'detail-grid';
    detailGrid.innerHTML = `
      <div><strong>Order ID</strong><span>${valueOrFallback(order.orderId)}</span></div>
      <div><strong>Tracking ID</strong><span>${valueOrFallback(order.trackingId)}</span></div>
      <div><strong>Date</strong><span>${valueOrFallback(order.date)}</span></div>
      <div><strong>Status</strong><span>${valueOrFallback(order.status)}</span></div>
      <div><strong>Printed</strong><span>${order.isPrintOrder ? `Yes (${order.printCount ?? 0})` : 'No'}</span></div>
      <div><strong>Completed</strong><span>${order.isOrderCompleted ? 'Yes' : 'No'}</span></div>
      <div><strong>Version</strong><span>${valueOrFallback(order.version)}</span></div>
      <div><strong>Source</strong><span>${valueOrFallback(order.source)}</span></div>
      <div><strong>Sheet</strong><span>${valueOrFallback(order.importSheetType)}</span></div>
      <div><strong>Created By</strong><span>${valueOrFallback(order.createdBy?.email)}</span></div>
      <div><strong>Updated By</strong><span>${valueOrFallback(order.updatedBy?.email)}</span></div>
      <div class="detail-grid__wide"><strong>Product Lines</strong><span>${(order.productLines ?? []).join(', ') || '-'}</span></div>
    `;
    body.appendChild(detailGrid);
    body.appendChild(
      renderProductItemsSection({
        order,
        canManageProductItems:
          canManageProductItems &&
          order.status !== 'completed' &&
          order.status !== 'cancelled',
        disabled: detailState.loading || actionLoading,
        onUpdateProductItems
      })
    );
  }

  panel.appendChild(body);
  container.appendChild(overlay);
  container.appendChild(panel);

  return container;
}
