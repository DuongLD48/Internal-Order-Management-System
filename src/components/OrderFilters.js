import { SHEET_TYPES } from '../constants/app.js';

function formatDateInputValue(value) {
  const digits = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 4);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function renderOrderFilters({
  search,
  filters,
  disabled = false,
  onSearchChange,
  onFilterChange
}) {
  const card = document.createElement('article');
  card.className = 'panel';

  card.innerHTML = `
    <h3>Filters</h3>
    <p>Search by order ID, tracking ID, or product line. Filters are applied instantly on the current order list.</p>
  `;

  const form = document.createElement('div');
  form.className = 'order-filters';

  const searchField = document.createElement('label');
  searchField.className = 'field';
  searchField.innerHTML = `
    <span>Quick Search</span>
    <input data-order-filter="search" type="search" placeholder="Search order / tracking / product line" value="${search}" />
  `;

  const statusField = document.createElement('label');
  statusField.className = 'field';
  statusField.innerHTML = `
    <span>Status</span>
    <select data-order-filter="status">
      <option value="">All statuses</option>
      <option value="open" ${filters.status === 'open' ? 'selected' : ''}>Open</option>
      <option value="printed" ${filters.status === 'printed' ? 'selected' : ''}>Printed</option>
      <option value="completed" ${filters.status === 'completed' ? 'selected' : ''}>Completed</option>
      <option value="cancelled" ${filters.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
    </select>
  `;

  const completedField = document.createElement('label');
  completedField.className = 'field';
  completedField.innerHTML = `
    <span>Completion</span>
    <select data-order-filter="completed">
      <option value="">All</option>
      <option value="completed" ${filters.completed === 'completed' ? 'selected' : ''}>Completed only</option>
      <option value="open" ${filters.completed === 'open' ? 'selected' : ''}>Not completed</option>
    </select>
  `;

  const dateFromField = document.createElement('label');
  dateFromField.className = 'field';
  dateFromField.innerHTML = `
    <span>Date From</span>
    <input data-order-filter="dateFrom" type="text" inputmode="numeric" placeholder="mm/dd" value="${filters.dateFrom ?? ''}" />
  `;

  const dateToField = document.createElement('label');
  dateToField.className = 'field';
  dateToField.innerHTML = `
    <span>Date To</span>
    <input data-order-filter="dateTo" type="text" inputmode="numeric" placeholder="mm/dd" value="${filters.dateTo ?? ''}" />
  `;

  const sheetField = document.createElement('label');
  sheetField.className = 'field';
  sheetField.innerHTML = `
    <span>Sheet Type</span>
    <select data-order-filter="sheetType">
      <option value="">All sheet types</option>
      ${SHEET_TYPES.map(
        (item) => `<option value="${item}" ${filters.sheetType === item ? 'selected' : ''}>${item}</option>`
      ).join('')}
    </select>
  `;

  const inputs = [
    searchField.querySelector('input'),
    statusField.querySelector('select'),
    completedField.querySelector('select'),
    dateFromField.querySelector('input'),
    dateToField.querySelector('input'),
    sheetField.querySelector('select')
  ];

  inputs.forEach((input) => {
    input.disabled = disabled;
  });

  searchField.querySelector('input').addEventListener('input', (event) => {
    onSearchChange?.(event.target.value);
  });

  statusField.querySelector('select').addEventListener('change', (event) => {
    onFilterChange?.('status', event.target.value);
  });

  completedField.querySelector('select').addEventListener('change', (event) => {
    onFilterChange?.('completed', event.target.value);
  });

  dateFromField.querySelector('input').addEventListener('input', (event) => {
    const nextValue = formatDateInputValue(event.target.value);
    event.target.value = nextValue;
    onFilterChange?.('dateFrom', nextValue);
  });

  dateToField.querySelector('input').addEventListener('input', (event) => {
    const nextValue = formatDateInputValue(event.target.value);
    event.target.value = nextValue;
    onFilterChange?.('dateTo', nextValue);
  });

  sheetField.querySelector('select').addEventListener('change', (event) => {
    onFilterChange?.('sheetType', event.target.value);
  });

  form.appendChild(searchField);
  form.appendChild(statusField);
  form.appendChild(completedField);
  form.appendChild(dateFromField);
  form.appendChild(dateToField);
  form.appendChild(sheetField);
  card.appendChild(form);

  return card;
}
