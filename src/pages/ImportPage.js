import { SHEET_TYPES } from '../constants/app.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { hasPermission } from '../guards/roleGuard.js';
import { importService, systemLockService } from '../services/index.js';
import { renderImportSummaryPanel } from '../components/ImportSummaryPanel.js';
import { renderImportPreviewTable } from '../components/ImportPreviewTable.js';

const IMPORT_PLACEHOLDERS = {
  SDR: `04/10\tSYC0016SSRG-S\tYT2610000701319285\tVN\tIn Production\tTRUE\t\t\t\t#sdr4439
04/10\tSYC0016SSRG-L\tYT2610000701319285\tVN\tIn Production\tTRUE\t\t\t\t#sdr4439
04/10\tSYC0180FSHO-M\tYT2610000701319053\tVN\tIn Production\tTRUE\t\t\t\t#sdr4440`,
  BATT: `04/04\tVN\tBLZ006LRG-V19-M\tYT2609401000626219\tIn Production\tTRUE\t\t\t112-4226237-9024269
04/04\tVN\tBLZ006LRG-V15-M\tYT2609401000626219\tIn Production\tTRUE\t\t\t112-4226237-9024269
04/04\tVN\tBLZ006LRG-V14-M\tYT2609401000626219\tIn Production\tTRUE\t\t\t112-4226237-9024269`,
  BFG: `03/30\tSYC0118SSRG-M\tYT2608901001212142\tIn Production\tVN\tTRUE\t\t\t113-8071385-7490603
03/30\tSYC0066SSRG-M\tYT2608901001212142\tIn Production\tVN\tTRUE\t\t\t113-8071385-7490603
03/30\tSYC0207SSRG-M\tYT2608901001212142\tIn Production\tVN\tTRUE\t\t\t113-8071385-7490603`
};

function renderAccessDenied() {
  const section = document.createElement('section');
  section.className = 'page';
  section.innerHTML = `
    <article class="panel">
      <h3>Access denied</h3>
      <p>Your account cannot import orders.</p>
    </article>
  `;
  return section;
}

export function renderImportPage({ state }) {
  if (!hasPermission(state.currentUser?.role, PERMISSIONS.ORDERS_IMPORT)) {
    return renderAccessDenied();
  }

  const section = document.createElement('section');
  section.className = 'page';

  const viewState = {
    sheetType: SHEET_TYPES[0],
    rawText: '',
    loading: false,
    error: '',
    result: null,
    createLoading: false,
    createError: '',
    createSuccess: '',
    duplicateConflicts: [],
    overwriteExisting: false,
    importLock: null
  };

  const hero = document.createElement('div');
  hero.className = 'page-hero';
  hero.innerHTML = `
    <div>
      <span class="eyebrow">Order Import</span>
      <h2>Import orders from Excel</h2>
      <p class="page-copy">
        Paste data from Excel, review it, and create orders when everything looks correct.
      </p>
    </div>
    <div class="hero-card">
      <strong>${state.currentUser?.role ?? 'viewer'}</strong>
      <span>${state.currentUser?.email ?? 'Unknown user'}</span>
    </div>
  `;

  const editorCard = document.createElement('article');
  editorCard.className = 'panel';
  editorCard.innerHTML = `
    <h3>Paste Source Data</h3>
    <p>Select the sheet type, paste the data, and click Parse Preview.</p>
  `;

  const chipRow = document.createElement('div');
  chipRow.className = 'chip-row';

  const textarea = document.createElement('textarea');
  textarea.className = 'import-textarea';
  textarea.placeholder = IMPORT_PLACEHOLDERS[viewState.sheetType];

  const parseButton = document.createElement('button');
  parseButton.type = 'button';
  parseButton.className = 'button button--primary';
  parseButton.textContent = 'Parse Preview';

  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.className = 'button button--secondary';
  createButton.textContent = 'Create Orders';

  const overwriteLabel = document.createElement('label');
  overwriteLabel.className = 'checkbox-row';
  overwriteLabel.innerHTML = `
    <input type="checkbox" />
    <span>Allow overwrite when orderId already exists</span>
  `;

  const createFeedback = document.createElement('div');
  createFeedback.className = 'seed-feedback';
  createFeedback.textContent = ' ';

  const helper = document.createElement('p');
  helper.className = 'import-helper';
  helper.textContent = 'Supported sheet types: SDR, BATT, and BFG.';

  const summaryMount = document.createElement('div');
  const previewMount = document.createElement('div');

  const renderPage = () => {
    chipRow.innerHTML = '';

    SHEET_TYPES.forEach((sheetType) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `chip-button${viewState.sheetType === sheetType ? ' is-active' : ''}`;
      button.textContent = sheetType;
      button.disabled = viewState.loading;
      button.addEventListener('click', () => {
        if (!hasPermission(state.currentUser?.role, PERMISSIONS.ORDERS_IMPORT)) {
          return;
        }

        viewState.sheetType = sheetType;
        renderPage();
      });
      chipRow.appendChild(button);
    });

    textarea.value = viewState.rawText;
    textarea.placeholder = IMPORT_PLACEHOLDERS[viewState.sheetType];
    textarea.disabled = viewState.loading;
    parseButton.disabled = viewState.loading;
    parseButton.textContent = viewState.loading ? 'Parsing...' : 'Parse Preview';
    createButton.disabled = viewState.loading || viewState.createLoading || !viewState.result?.previewRows?.length;
    createButton.textContent = viewState.createLoading ? 'Creating...' : 'Create Orders';
    overwriteLabel.querySelector('input').checked = viewState.overwriteExisting;
    overwriteLabel.querySelector('input').disabled = viewState.createLoading;
    overwriteLabel.style.display = viewState.duplicateConflicts.length ? 'flex' : 'none';

    const importLockedByAnotherUser =
      viewState.importLock?.active &&
      viewState.importLock.owner?.uid !== state.currentUser?.uid;

    createButton.disabled =
      createButton.disabled || importLockedByAnotherUser;

    if (viewState.createSuccess) {
      createFeedback.className = 'seed-feedback is-success';
      createFeedback.textContent = viewState.createSuccess;
    } else if (viewState.createError) {
      createFeedback.className = 'seed-feedback is-error';
      createFeedback.textContent = viewState.createError;
    } else {
      createFeedback.className = 'seed-feedback';
      createFeedback.textContent = ' ';
    }

    summaryMount.innerHTML = '';
    summaryMount.appendChild(
      renderImportSummaryPanel({
        result: viewState.result,
        loading: viewState.loading,
        error: viewState.error
      })
    );

    if (viewState.importLock?.active) {
      const lockCard = document.createElement('article');
      lockCard.className = 'panel';
      lockCard.innerHTML = `
        <h3>Import Lock Active</h3>
        <p>${systemLockService.getImportLockMessage(viewState.importLock)}</p>
      `;
      summaryMount.prepend(lockCard);
    }

    previewMount.innerHTML = '';
    previewMount.appendChild(
      renderImportPreviewTable({
        result: viewState.result
      })
    );

    if (viewState.duplicateConflicts.length) {
      const duplicateCard = document.createElement('article');
      duplicateCard.className = 'panel';
      duplicateCard.innerHTML = `
        <h3>Duplicate Order IDs</h3>
        <p>Some order IDs already exist. Review them carefully and only overwrite if you really want to replace the current data.</p>
      `;

      const list = document.createElement('ul');
      list.className = 'import-message-list';

      viewState.duplicateConflicts.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = `${item.orderId} (tracking: ${item.trackingId}, status: ${item.status})`;
        list.appendChild(li);
      });

      duplicateCard.appendChild(list);
      previewMount.appendChild(duplicateCard);
    }
  };

  textarea.addEventListener('input', (event) => {
    viewState.rawText = event.target.value;
  });

  parseButton.addEventListener('click', async () => {
    if (!hasPermission(state.currentUser?.role, PERMISSIONS.ORDERS_IMPORT)) {
      viewState.error = 'Import permission is required.';
      renderPage();
      return;
    }

    viewState.loading = true;
    viewState.error = '';
    viewState.createError = '';
    viewState.createSuccess = '';
    viewState.duplicateConflicts = [];
    renderPage();

    try {
      viewState.result = await importService.previewImportedOrders({
        rawText: viewState.rawText,
        sheetType: viewState.sheetType,
        actor: state.currentUser
      });
    } catch (error) {
      viewState.result = null;
      viewState.error = error.message || 'Failed to preview pasted rows.';
    } finally {
      viewState.loading = false;
      renderPage();
    }
  });

  overwriteLabel.querySelector('input').addEventListener('change', (event) => {
    viewState.overwriteExisting = event.target.checked;
  });

  createButton.addEventListener('click', async () => {
    if (!hasPermission(state.currentUser?.role, PERMISSIONS.ORDERS_IMPORT)) {
      viewState.createError = 'Import permission is required.';
      renderPage();
      return;
    }

    if (!viewState.result?.previewRows?.length) {
      viewState.createError = 'Preview rows are required before creating orders.';
      renderPage();
      return;
    }

    viewState.createLoading = true;
    viewState.createError = '';
    viewState.createSuccess = '';
    renderPage();

    try {
      const response = await importService.createOrdersFromPreview({
        previewResult: viewState.result,
        actor: state.currentUser,
        overwriteExisting: viewState.overwriteExisting
      });

      if (!response.success && response.requiresOverwriteConfirmation) {
        viewState.duplicateConflicts = response.duplicates;
        viewState.createError =
          'Duplicate order IDs found. Tick overwrite confirmation if you want to replace existing orders.';
      } else {
        viewState.duplicateConflicts = [];
        viewState.createSuccess = `Created ${response.createdCount} orders, updated ${response.updatedCount} existing orders.`;
      }
    } catch (error) {
      viewState.createError = error.message || 'Failed to create orders from preview.';
    } finally {
      viewState.createLoading = false;
      await refreshImportLock();
      renderPage();
    }
  });

  editorCard.appendChild(chipRow);
  editorCard.appendChild(textarea);
  const actionRow = document.createElement('div');
  actionRow.className = 'seed-actions';
  actionRow.appendChild(parseButton);
  actionRow.appendChild(createButton);
  editorCard.appendChild(actionRow);
  editorCard.appendChild(overwriteLabel);
  editorCard.appendChild(createFeedback);
  editorCard.appendChild(helper);

  section.appendChild(hero);
  section.appendChild(editorCard);
  section.appendChild(summaryMount);
  section.appendChild(previewMount);

  const refreshImportLock = async () => {
    try {
      viewState.importLock = await systemLockService.getImportLock(state.currentUser);
    } catch (_error) {
      viewState.importLock = null;
    }
  };

  void refreshImportLock().then(renderPage);

  renderPage();

  return section;
}
