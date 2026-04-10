export function renderOrderBulkActions({
  selectedCount,
  unprintedCount,
  canPrint,
  printBlockedReason,
  actionLoading,
  actionMessage,
  actionError,
  onPrintSelected,
  onPrintUnprinted,
  onClearSelection
}) {
  const card = document.createElement('article');
  card.className = 'panel';
  card.innerHTML = `
    <h3>Bulk Actions</h3>
    <p>Select rows for printing or print all visible unprinted orders. Permission is checked before rendering and execution.</p>
  `;

  const stats = document.createElement('div');
  stats.className = 'bulk-stats';
  stats.innerHTML = `
    <span><strong>${selectedCount}</strong> selected</span>
    <span><strong>${unprintedCount}</strong> visible unprinted</span>
  `;

  const actions = document.createElement('div');
  actions.className = 'bulk-actions-row';

  const printSelectedButton = document.createElement('button');
  printSelectedButton.type = 'button';
  printSelectedButton.className = 'button button--primary';
  printSelectedButton.textContent = actionLoading ? 'Processing...' : 'Print Selected';
  printSelectedButton.disabled = !canPrint || Boolean(printBlockedReason) || actionLoading || selectedCount === 0;
  printSelectedButton.addEventListener('click', () => onPrintSelected?.());

  const printUnprintedButton = document.createElement('button');
  printUnprintedButton.type = 'button';
  printUnprintedButton.className = 'button button--secondary';
  printUnprintedButton.textContent = actionLoading ? 'Processing...' : 'Print Unprinted';
  printUnprintedButton.disabled = !canPrint || Boolean(printBlockedReason) || actionLoading || unprintedCount === 0;
  printUnprintedButton.addEventListener('click', () => onPrintUnprinted?.());

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'button button--secondary';
  clearButton.textContent = 'Clear Selection';
  clearButton.disabled = actionLoading || selectedCount === 0;
  clearButton.addEventListener('click', () => onClearSelection?.());

  if (canPrint) {
    actions.appendChild(printSelectedButton);
    actions.appendChild(printUnprintedButton);
  }
  actions.appendChild(clearButton);

  const feedback = document.createElement('div');
  feedback.className = 'seed-feedback';

  if (actionError) {
    feedback.classList.add('is-error');
    feedback.textContent = actionError;
  } else if (actionMessage) {
    feedback.classList.add('is-success');
    feedback.textContent = actionMessage;
  } else {
    feedback.textContent = ' ';
  }

  card.appendChild(stats);
  card.appendChild(actions);

  if (printBlockedReason) {
    const lockNote = document.createElement('p');
    lockNote.className = 'import-lock-note';
    lockNote.textContent = printBlockedReason;
    card.appendChild(lockNote);
  }

  card.appendChild(feedback);

  return card;
}
