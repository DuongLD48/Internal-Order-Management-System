import { PERMISSIONS } from '../constants/permissions.js';
import { hasPermission } from '../guards/roleGuard.js';
import { logService } from '../services/index.js';
import { toDateInputValue } from '../utils/dateFormatter.js';

function formatPrintedAt(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString();
}

function renderProducts(record) {
  const wrapper = document.createElement('div');
  wrapper.className = 'product-chip-list';

  const items = Array.isArray(record.productItems) && record.productItems.length
    ? record.productItems
    : (record.productLines ?? []).map((name, index) => ({
        id: `print_fallback_${index + 1}`,
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

function renderSummaryCards(records) {
  const uniqueOrders = new Set(records.map((item) => item.orderId)).size;
  const reprints = records.filter((item) => item.action === 'REPRINT_ORDER').length;

  const grid = document.createElement('div');
  grid.className = 'summary-grid';

  [
    ['Print Actions', String(records.length)],
    ['Unique Orders', String(uniqueOrders)],
    ['Reprints', String(reprints)]
  ].forEach(([label, value]) => {
    const item = document.createElement('article');
    item.className = 'summary-card';
    item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    grid.appendChild(item);
  });

  return grid;
}

function renderPrintLogsTable({ records, loading, error }) {
  const card = document.createElement('article');
  card.className = 'panel';
  card.innerHTML = `
    <h3>Printed Orders</h3>
    <p>All print and reprint actions on the selected day are listed below.</p>
  `;

  if (loading) {
    const state = document.createElement('div');
    state.className = 'table-state';
    state.textContent = 'Loading print logs...';
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

  if (!records.length) {
    const state = document.createElement('div');
    state.className = 'table-state';
    state.textContent = 'No printed orders found for the selected date.';
    card.appendChild(state);
    return card;
  }

  const tableWrap = document.createElement('div');
  tableWrap.className = 'orders-table-wrap';

  const table = document.createElement('table');
  table.className = 'orders-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Printed At</th>
        <th>Printed By</th>
        <th>Order ID</th>
        <th>Tracking</th>
        <th>Date</th>
        <th>Product</th>
        <th>Sheet</th>
        <th>Action</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  records.forEach((record) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatPrintedAt(record.createdAt)}</td>
      <td>${record.createdBy?.email ?? record.createdBy?.name ?? '-'}</td>
      <td>${record.orderId}</td>
      <td>${record.trackingId || '-'}</td>
      <td>${record.date || '-'}</td>
      <td class="orders-table__products-cell"></td>
      <td>${record.importSheetType || '-'}</td>
      <td><span class="status-pill status-pill--printed">${record.action === 'REPRINT_ORDER' ? 'Reprint' : 'Print'}</span></td>
    `;

    row.querySelector('.orders-table__products-cell').appendChild(renderProducts(record));
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  card.appendChild(tableWrap);

  return card;
}

export function renderPrintLogsPage({ state }) {
  const section = document.createElement('section');
  section.className = 'page';

  if (!hasPermission(state.currentUser?.role, PERMISSIONS.LOGS_VIEW)) {
    section.innerHTML = `
      <article class="panel">
        <h3>Print Logs Access Denied</h3>
        <p>Your current role cannot view print logs.</p>
      </article>
    `;
    return section;
  }

  const viewState = {
    selectedDate: toDateInputValue(Date.now()),
    records: [],
    loading: false,
    error: ''
  };

  const hero = document.createElement('div');
  hero.className = 'page-hero';
  hero.innerHTML = `
    <div>
      <span class="eyebrow">Print Logs</span>
      <h2>Printed batch lookup</h2>
      <p class="page-copy">
        Pick a print date to review the full batch, including who printed each order and what products were included.
      </p>
    </div>
    <div class="hero-card">
      <strong>${state.currentUser?.role ?? 'viewer'}</strong>
      <span>${state.currentUser?.email ?? 'Unknown user'}</span>
    </div>
  `;

  const filtersMount = document.createElement('div');
  const summaryMount = document.createElement('div');
  const tableMount = document.createElement('div');

  section.appendChild(hero);
  section.appendChild(filtersMount);
  section.appendChild(summaryMount);
  section.appendChild(tableMount);

  const loadPrintLogs = async () => {
    viewState.loading = true;
    viewState.error = '';
    renderPageSections();

    try {
      viewState.records = await logService.getPrintLogsByDate(viewState.selectedDate, state.currentUser);
    } catch (error) {
      viewState.records = [];
      viewState.error = error.message || 'Failed to load print logs.';
    } finally {
      viewState.loading = false;
      renderPageSections();
    }
  };

  const renderPageSections = () => {
    filtersMount.innerHTML = '';

    const filtersCard = document.createElement('article');
    filtersCard.className = 'panel';
    filtersCard.innerHTML = `
      <h3>Choose Print Date</h3>
      <p>Use a full date because print logs are stored with exact timestamps.</p>
    `;

    const formRow = document.createElement('div');
    formRow.className = 'print-log-filter-row';

    const field = document.createElement('label');
    field.className = 'field';
    field.innerHTML = `
      <span>Print Date</span>
      <input type="date" value="${viewState.selectedDate}" />
    `;

    field.querySelector('input').addEventListener('change', (event) => {
      viewState.selectedDate = event.target.value;
      void loadPrintLogs();
    });

    formRow.appendChild(field);
    filtersCard.appendChild(formRow);
    filtersMount.appendChild(filtersCard);

    summaryMount.innerHTML = '';
    if (!viewState.loading && !viewState.error && viewState.records.length) {
      summaryMount.appendChild(renderSummaryCards(viewState.records));
    }

    tableMount.innerHTML = '';
    tableMount.appendChild(
      renderPrintLogsTable({
        records: viewState.records,
        loading: viewState.loading,
        error: viewState.error
      })
    );
  };

  renderPageSections();
  void loadPrintLogs();

  return section;
}
