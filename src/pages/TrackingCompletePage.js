import { PERMISSIONS } from '../constants/permissions.js';
import { hasPermission } from '../guards/roleGuard.js';
import { orderService } from '../services/index.js';

function renderAccessDenied() {
  const section = document.createElement('section');
  section.className = 'page';
  section.innerHTML = `
    <article class="panel">
      <h3>Tracking Complete Access Denied</h3>
      <p>Your current role cannot complete orders from tracking input.</p>
    </article>
  `;
  return section;
}

function renderPreviewTable(previewResult) {
  const card = document.createElement('article');
  card.className = 'panel';
  card.innerHTML = `
    <h3>Tracking Review</h3>
    <p>Check every tracking result before confirming the completion batch.</p>
  `;

  if (!previewResult) {
    const state = document.createElement('div');
    state.className = 'table-state';
    state.textContent = 'Paste tracking IDs and click Review Tracking to begin.';
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
        <th>#</th>
        <th>Tracking</th>
        <th>Result</th>
        <th>Order ID</th>
        <th>Date</th>
        <th>Product</th>
        <th>Message</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  previewResult.items.forEach((item) => {
    const row = document.createElement('tr');
    row.className = `tracking-review-row tracking-review-row--${item.status}`;
    row.innerHTML = `
      <td>${item.rowNumber}</td>
      <td>${item.trackingId}</td>
      <td><span class="status-pill tracking-review-pill tracking-review-pill--${item.status}">${item.status.replaceAll('_', ' ')}</span></td>
      <td>${item.order?.orderId ?? '-'}</td>
      <td>${item.order?.date ?? '-'}</td>
      <td>${item.order?.productLines?.join(', ') ?? '-'}</td>
      <td>${item.message}</td>
    `;
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  card.appendChild(tableWrap);

  return card;
}

export function renderTrackingCompletePage({ state }) {
  if (!hasPermission(state.currentUser?.role, PERMISSIONS.ORDERS_COMPLETE)) {
    return renderAccessDenied();
  }

  const section = document.createElement('section');
  section.className = 'page';

  const viewState = {
    trackingInput: '',
    loading: false,
    confirming: false,
    previewResult: null,
    resultMessage: '',
    resultTone: '',
    confirmChecked: false
  };

  const hero = document.createElement('div');
  hero.className = 'page-hero';
  hero.innerHTML = `
    <div>
      <span class="eyebrow">Batch Completion</span>
      <h2>Complete orders from tracking IDs</h2>
      <p class="page-copy">
        Paste one tracking ID per line. The system will review each tracking, show anything already completed or missing,
        and only allow confirmation when every tracked order is safe to complete.
      </p>
    </div>
    <div class="hero-card">
      <strong>${state.currentUser?.role ?? 'viewer'}</strong>
      <span>${state.currentUser?.email ?? 'Unknown user'}</span>
    </div>
  `;

  const controlsMount = document.createElement('div');
  const summaryMount = document.createElement('div');
  const previewMount = document.createElement('div');

  section.appendChild(hero);
  section.appendChild(controlsMount);
  section.appendChild(summaryMount);
  section.appendChild(previewMount);

  const runPreview = async () => {
    viewState.loading = true;
    viewState.resultMessage = '';
    viewState.resultTone = '';
    viewState.previewResult = null;
    viewState.confirmChecked = false;
    renderPage();

    try {
      viewState.previewResult = await orderService.previewCompleteByTracking(
        viewState.trackingInput,
        state.currentUser
      );

      if (!viewState.previewResult.canConfirm) {
        viewState.resultMessage = 'Some tracking IDs need attention before completion can run.';
        viewState.resultTone = 'error';
      } else {
        viewState.resultMessage = `All checks passed. ${viewState.previewResult.readyCount} order(s) are ready to complete.`;
        viewState.resultTone = 'success';
      }
    } catch (error) {
      viewState.resultMessage = error.message || 'Failed to review tracking input.';
      viewState.resultTone = 'error';
    } finally {
      viewState.loading = false;
      renderPage();
    }
  };

  const confirmComplete = async () => {
    if (!viewState.previewResult?.canConfirm) {
      return;
    }

    if (!viewState.confirmChecked) {
      viewState.resultMessage = 'Please tick the confirmation checkbox before completing orders.';
      viewState.resultTone = 'error';
      renderPage();
      return;
    }

    const readyCount = viewState.previewResult.readyCount;
    const confirmed = window.confirm(
      `Complete ${readyCount} order(s) from the reviewed tracking list? This cannot be skipped in bulk.`
    );

    if (!confirmed) {
      return;
    }

    viewState.confirming = true;
    viewState.resultMessage = '';
    viewState.resultTone = '';
    renderPage();

    try {
      const completedOrders = await orderService.completeOrdersByTrackingPreview(
        viewState.previewResult,
        state.currentUser
      );

      viewState.resultMessage = `Completed ${completedOrders.length} order(s) successfully.`;
      viewState.resultTone = 'success';
      viewState.previewResult = null;
      viewState.trackingInput = '';
      viewState.confirmChecked = false;
    } catch (error) {
      viewState.resultMessage = error.message || 'Failed to complete orders.';
      viewState.resultTone = 'error';
    } finally {
      viewState.confirming = false;
      renderPage();
    }
  };

  const renderPage = () => {
    controlsMount.innerHTML = '';
    summaryMount.innerHTML = '';
    previewMount.innerHTML = '';

    const controlsCard = document.createElement('article');
    controlsCard.className = 'panel';
    controlsCard.innerHTML = `
      <h3>Tracking Input</h3>
      <p>Paste one tracking ID per line. Duplicate lines are shown as warnings and processed only once when valid.</p>
    `;

    const textarea = document.createElement('textarea');
    textarea.className = 'import-textarea';
    textarea.placeholder = 'YT2607501002325397\nYT2607501002325397\nYT2607500707559508';
    textarea.value = viewState.trackingInput;
    textarea.disabled = viewState.loading || viewState.confirming;
    textarea.addEventListener('input', (event) => {
      viewState.trackingInput = event.target.value;
    });

    const actionsRow = document.createElement('div');
    actionsRow.className = 'bulk-actions-row';

    const reviewButton = document.createElement('button');
    reviewButton.type = 'button';
    reviewButton.className = 'button button--primary';
    reviewButton.disabled = viewState.loading || viewState.confirming;
    reviewButton.textContent = viewState.loading ? 'Reviewing...' : 'Review Tracking';
    reviewButton.addEventListener('click', () => {
      void runPreview();
    });

    const completeButton = document.createElement('button');
    completeButton.type = 'button';
    completeButton.className = 'button button--secondary';
    completeButton.disabled =
      viewState.loading ||
      viewState.confirming ||
      !viewState.previewResult?.canConfirm;
    completeButton.textContent = viewState.confirming ? 'Completing...' : 'Complete Reviewed Orders';
    completeButton.addEventListener('click', () => {
      void confirmComplete();
    });

    actionsRow.appendChild(reviewButton);
    actionsRow.appendChild(completeButton);

    const confirmRow = document.createElement('label');
    confirmRow.className = `checkbox-row ${viewState.previewResult?.canConfirm ? 'checkbox-row--visible' : ''}`;
    confirmRow.innerHTML = `
      <input type="checkbox" ${viewState.confirmChecked ? 'checked' : ''} />
      <span>I reviewed every tracking result and want to complete the valid orders.</span>
    `;
    confirmRow.querySelector('input').addEventListener('change', (event) => {
      viewState.confirmChecked = event.target.checked;
    });

    controlsCard.appendChild(textarea);
    controlsCard.appendChild(actionsRow);
    controlsCard.appendChild(confirmRow);

    if (viewState.resultMessage) {
      const banner = document.createElement('div');
      banner.className = `import-result-banner ${viewState.resultTone === 'success' ? 'is-success' : 'is-error'}`;
      banner.textContent = viewState.resultMessage;
      controlsCard.appendChild(banner);
    }

    controlsMount.appendChild(controlsCard);

    if (viewState.previewResult) {
      const summary = document.createElement('div');
      summary.className = 'summary-grid';

      [
        ['Input Rows', String(viewState.previewResult.inputCount)],
        ['Unique Tracking', String(viewState.previewResult.uniqueTrackingCount)],
        ['Ready Orders', String(viewState.previewResult.readyCount)],
        ['Duplicate Inputs', String(viewState.previewResult.duplicateInputCount)]
      ].forEach(([label, value]) => {
        const item = document.createElement('article');
        item.className = 'summary-card';
        item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
        summary.appendChild(item);
      });

      summaryMount.appendChild(summary);
    }

    previewMount.appendChild(renderPreviewTable(viewState.previewResult));
  };

  renderPage();

  return section;
}
