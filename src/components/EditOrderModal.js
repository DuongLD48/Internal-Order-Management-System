function createInitialForm(order) {
  return {
    date: order?.date ?? '',
    trackingId: order?.trackingId ?? '',
    product: (order?.productLines ?? []).join('\n')
  };
}

function validateEditForm(form) {
  if (!form.date.trim()) {
    return 'Date is required.';
  }

  if (!/^\d{2}\/\d{2}$/.test(form.date.trim())) {
    return 'Date must use dd/mm format.';
  }

  if (!form.trackingId.trim()) {
    return 'Tracking ID is required.';
  }

  if (!form.product.trim()) {
    return 'At least one product line is required.';
  }

  return '';
}

function buildField(label, name, value, options = {}) {
  const field = document.createElement('label');
  field.className = 'field';

  const labelText = document.createElement('span');
  labelText.textContent = label;

  const input = document.createElement(options.multiline ? 'textarea' : 'input');
  input.name = name;
  input.value = value;
  input.disabled = Boolean(options.disabled);
  input.readOnly = Boolean(options.readOnly);
  input.placeholder = options.placeholder ?? '';

  if (options.multiline) {
    input.className = 'modal-textarea';
    input.rows = options.rows ?? 6;
  } else {
    input.type = options.type ?? 'text';
  }

  field.appendChild(labelText);
  field.appendChild(input);

  if (options.helper) {
    const helper = document.createElement('small');
    helper.className = 'field-helper';
    helper.textContent = options.helper;
    field.appendChild(helper);
  }

  return field;
}

export function renderEditOrderModal({
  open,
  order,
  loading,
  error,
  onClose,
  onSave
}) {
  const shell = document.createElement('div');
  shell.className = `modal-shell${open ? ' is-open' : ''}`;

  if (!open) {
    return shell;
  }

  const overlay = document.createElement('button');
  overlay.type = 'button';
  overlay.className = 'modal-overlay';
  overlay.setAttribute('aria-label', 'Close edit order modal');
  overlay.addEventListener('click', () => {
    if (!loading) {
      onClose?.();
    }
  });

  const panel = document.createElement('section');
  panel.className = 'modal-panel';

  panel.innerHTML = `
    <div class="modal-header">
      <div>
        <span class="eyebrow">Admin Edit</span>
        <h3>Edit Order</h3>
        <p class="page-copy">
          Saving will reset the order back to open and keep print history unchanged.
        </p>
      </div>
    </div>
  `;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'button button--secondary';
  closeButton.textContent = 'Close';
  closeButton.disabled = loading;
  closeButton.addEventListener('click', () => onClose?.());
  panel.querySelector('.modal-header').appendChild(closeButton);

  if (!order) {
    const empty = document.createElement('div');
    empty.className = 'table-state';
    empty.textContent = 'Order detail is required before editing.';
    panel.appendChild(empty);
    shell.appendChild(overlay);
    shell.appendChild(panel);
    return shell;
  }

  const form = document.createElement('form');
  form.className = 'form-grid';

  const initialForm = createInitialForm(order);

  form.appendChild(
    buildField('Order ID', 'orderId', order.orderId ?? '', {
      disabled: loading,
      readOnly: true,
      helper: 'Order ID is read-only to avoid moving Firestore document IDs.'
    })
  );
  form.appendChild(buildField('Date', 'date', initialForm.date, { placeholder: '30/03', disabled: loading }));
  form.appendChild(buildField('Tracking ID', 'trackingId', initialForm.trackingId, { disabled: loading }));
  form.appendChild(
    buildField('Product Lines', 'product', initialForm.product, {
      multiline: true,
      rows: 8,
      disabled: loading,
      helper: 'One product per line.'
    })
  );

  const feedback = document.createElement('div');
  feedback.className = `form-feedback${error ? ' is-error' : ''}`;
  feedback.textContent = error || ' ';

  const actionRow = document.createElement('div');
  actionRow.className = 'modal-actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'button button--secondary';
  cancelButton.textContent = 'Cancel';
  cancelButton.disabled = loading;
  cancelButton.addEventListener('click', () => onClose?.());

  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'button button--primary';
  saveButton.disabled = loading;
  saveButton.textContent = loading ? 'Saving...' : 'Save Changes';

  actionRow.appendChild(cancelButton);
  actionRow.appendChild(saveButton);

  form.appendChild(feedback);
  form.appendChild(actionRow);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      date: String(formData.get('date') ?? '').trim(),
      trackingId: String(formData.get('trackingId') ?? '').trim(),
      product: String(formData.get('product') ?? '').trim()
    };

    const validationMessage = validateEditForm(payload);

    if (validationMessage) {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = validationMessage;
      return;
    }

    await onSave?.(payload);
  });

  panel.appendChild(form);
  shell.appendChild(overlay);
  shell.appendChild(panel);

  return shell;
}
