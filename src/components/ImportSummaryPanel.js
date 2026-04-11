function renderMessageList(title, items, tone) {
  const block = document.createElement('div');
  block.className = `import-message-block is-${tone}`;

  const heading = document.createElement('h4');
  heading.textContent = `${title} (${items.length})`;
  block.appendChild(heading);

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'import-message-empty';
    empty.textContent = `No ${title.toLowerCase()}.`;
    block.appendChild(empty);
    return block;
  }

  const list = document.createElement('ul');
  list.className = 'import-message-list';

  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item.message || item.reason || JSON.stringify(item);
    list.appendChild(li);
  });

  block.appendChild(list);
  return block;
}

export function renderImportSummaryPanel({ result, loading, error }) {
  const card = document.createElement('article');
  card.className = 'panel';
  card.innerHTML = `
    <h3>Validation Summary</h3>
    <p>Review the data before creating orders.</p>
  `;

  if (loading) {
    const state = document.createElement('div');
    state.className = 'table-state';
    state.textContent = 'Parsing and validating pasted rows...';
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

  if (!result) {
    const state = document.createElement('div');
    state.className = 'table-state';
    state.textContent = 'Paste tab-separated rows and click Parse Preview.';
    card.appendChild(state);
    return card;
  }

  const stats = document.createElement('div');
  stats.className = 'summary-grid';

  const values = [
    ['Input Rows', String(result.inputRowCount)],
    ['Valid Rows', String(result.validRowCount)],
    ['Ignored Rows', String(result.ignoredRowCount)],
    ['Aggregate Orders', String(result.aggregateCount)]
  ];

  values.forEach(([label, value]) => {
    const item = document.createElement('article');
    item.className = 'summary-card';
    item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    stats.appendChild(item);
  });

  const grid = document.createElement('div');
  grid.className = 'import-summary-layout';
  grid.appendChild(renderMessageList('Warnings', result.warnings, 'warning'));
  grid.appendChild(renderMessageList('Errors', result.errors, 'error'));

  if (result.ignoredRows.length) {
    grid.appendChild(renderMessageList('Ignored Rows', result.ignoredRows, 'muted'));
  }

  card.appendChild(stats);
  card.appendChild(grid);

  const footer = document.createElement('div');
  footer.className = `import-result-banner${result.canCreateOrders ? ' is-success' : ' is-error'}`;
  footer.textContent = result.canCreateOrders
    ? 'The data is valid and ready to create orders.'
    : 'There are blocking issues or no valid rows to create.';
  card.appendChild(footer);

  return card;
}
