import { PERMISSIONS } from '../constants/permissions.js';
import { hasPermission } from '../guards/roleGuard.js';
import { logService } from '../services/index.js';
import { toDateInputValue } from '../utils/dateFormatter.js';

function formatCompletedAt(value) {
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
        id: `complete_fallback_${index + 1}`,
        name,
        status: 'completed'
      }));

  if (!items.length) {
    wrapper.textContent = '-';
    return wrapper;
  }

  items.forEach((item) => {
    const chip = document.createElement('span');
    chip.className = `product-chip product-chip--${item.status || 'completed'}`;
    chip.textContent = item.name;
    wrapper.appendChild(chip);
  });

  return wrapper;
}

function renderSummaryCards(records, hasMore) {
  const uniqueOrders = new Set(records.map((item) => item.orderId)).size;

  const grid = document.createElement('div');
  grid.className = 'summary-grid';

  [
    ['Complete Actions', String(records.length)],
    ['Unique Orders', String(uniqueOrders)],
    ['Loaded', hasMore ? `${records.length}+` : String(records.length)]
  ].forEach(([label, value]) => {
    const item = document.createElement('article');
    item.className = 'summary-card';
    item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    grid.appendChild(item);
  });

  return grid;
}

function renderLogsTable({ records, loading, loadingMore, error, hasMore, onLoadMore }) {
  const card = document.createElement('article');
  card.className = 'panel';
  card.innerHTML = `
    <h3>Completed Orders</h3>
    <p>All complete actions on the selected day are listed below.</p>
  `;

  if (loading) {
    const state = document.createElement('div');
    state.className = 'table-state';
    state.textContent = 'Loading completion logs...';
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
    state.textContent = 'No completed orders found for the selected date.';
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
        <th>Completed At</th>
        <th>Completed By</th>
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
      <td>${formatCompletedAt(record.createdAt)}</td>
      <td>${record.createdBy?.email ?? record.createdBy?.name ?? '-'}</td>
      <td>${record.orderId}</td>
      <td>${record.trackingId || '-'}</td>
      <td>${record.date || '-'}</td>
      <td class="orders-table__products-cell"></td>
      <td>${record.importSheetType || '-'}</td>
      <td><span class="status-pill status-pill--completed">Complete</span></td>
    `;

    row.querySelector('.orders-table__products-cell').appendChild(renderProducts(record));
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  card.appendChild(tableWrap);

  if (hasMore) {
    const footer = document.createElement('div');
    footer.className = 'table-actions';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--secondary';
    button.disabled = loadingMore;
    button.textContent = loadingMore ? 'Loading More...' : 'Load More';
    button.addEventListener('click', () => {
      onLoadMore?.();
    });

    footer.appendChild(button);
    card.appendChild(footer);
  }

  return card;
}

export function renderCompleteLogsPage({ state }) {
  const section = document.createElement('section');
  section.className = 'page';

  if (!hasPermission(state.currentUser?.role, PERMISSIONS.LOGS_VIEW)) {
    section.innerHTML = `
      <article class="panel">
        <h3>Complete Logs Access Denied</h3>
        <p>Your current role cannot view complete logs.</p>
      </article>
    `;
    return section;
  }

  const viewState = {
    selectedDate: toDateInputValue(Date.now()),
    records: [],
    loading: false,
    loadingMore: false,
    error: '',
    hasMore: false,
    cursorSnapshot: null
  };

  const hero = document.createElement('div');
  hero.className = 'page-hero';
  hero.innerHTML = `
    <div>
      <span class="eyebrow">Complete Logs</span>
      <h2>Completed batch lookup</h2>
      <p class="page-copy">
        Pick a completion date to review the full completion batch, including who completed each order.
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

  const loadLogs = async ({ append = false } = {}) => {
    viewState.loading = !append;
    viewState.loadingMore = append;

    if (!append) {
      viewState.error = '';
      viewState.cursorSnapshot = null;
      viewState.hasMore = false;
    }

    renderPageSections();

    try {
      const result = await logService.getCompletionLogsPageByDate(viewState.selectedDate, state.currentUser, {
        cursorSnapshot: append ? viewState.cursorSnapshot : null
      });

      viewState.records = append
        ? [...viewState.records, ...result.records]
        : result.records;
      viewState.cursorSnapshot = result.cursorSnapshot;
      viewState.hasMore = result.hasMore;
    } catch (error) {
      if (!append) {
        viewState.records = [];
      }
      viewState.error = error.message || 'Failed to load complete logs.';
    } finally {
      viewState.loading = false;
      viewState.loadingMore = false;
      renderPageSections();
    }
  };

  const renderPageSections = () => {
    filtersMount.innerHTML = '';

    const filtersCard = document.createElement('article');
    filtersCard.className = 'panel';
    filtersCard.innerHTML = `
      <h3>Choose Completion Date</h3>
      <p>Use a full date because completion logs are stored with exact timestamps.</p>
    `;

    const formRow = document.createElement('div');
    formRow.className = 'print-log-filter-row';

    const field = document.createElement('label');
    field.className = 'field';
    field.innerHTML = `
      <span>Completion Date</span>
      <input type="date" value="${viewState.selectedDate}" />
    `;

    field.querySelector('input').addEventListener('change', (event) => {
      viewState.selectedDate = event.target.value;
      void loadLogs();
    });

    formRow.appendChild(field);
    filtersCard.appendChild(formRow);
    filtersMount.appendChild(filtersCard);

    summaryMount.innerHTML = '';
    if (!viewState.loading && !viewState.error && viewState.records.length) {
      summaryMount.appendChild(renderSummaryCards(viewState.records, viewState.hasMore));
    }

    tableMount.innerHTML = '';
    tableMount.appendChild(
      renderLogsTable({
        records: viewState.records,
        loading: viewState.loading,
        loadingMore: viewState.loadingMore,
        error: viewState.error,
        hasMore: viewState.hasMore,
        onLoadMore: () => {
          void loadLogs({ append: true });
        }
      })
    );
  };

  renderPageSections();
  void loadLogs();

  return section;
}
