import { SHEET_COLUMN_MAPS, MONTH_MAP } from '../constants/import.js';

function normalizeCell(value) {
  return String(value ?? '').trim();
}

function convertDateValue(rawDate) {
  const normalized = normalizeCell(rawDate);

  if (!normalized) {
    return '';
  }

  if (/^\d{1,2}\/\d{1,2}$/.test(normalized)) {
    const [day, month] = normalized.split('/');
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}`;
  }

  const shortMonthMatch = normalized.match(/^(\d{1,2})-([A-Za-z]{3})$/);

  if (shortMonthMatch) {
    const [, day, shortMonth] = shortMonthMatch;
    const mappedMonth = MONTH_MAP[shortMonth.toLowerCase()];
    return mappedMonth ? `${day.padStart(2, '0')}/${mappedMonth}` : normalized;
  }

  const extendedMonthMatch = normalized.match(/^(\d{1,2})-([A-Za-z]{3})-\d{2,4}$/);

  if (extendedMonthMatch) {
    const [, day, shortMonth] = extendedMonthMatch;
    const mappedMonth = MONTH_MAP[shortMonth.toLowerCase()];
    return mappedMonth ? `${day.padStart(2, '0')}/${mappedMonth}` : normalized;
  }

  return normalized;
}

function mapLineToRecord(line, sheetType, lineNumber) {
  const map = SHEET_COLUMN_MAPS[sheetType];

  if (!map) {
    throw new Error(`Unsupported sheet type: ${sheetType}`);
  }

  const cells = line.split('\t');

  return {
    lineNumber,
    rawLine: line,
    rawCells: cells,
    date: convertDateValue(cells[map.date]),
    product: normalizeCell(cells[map.product]),
    trackingId: normalizeCell(cells[map.trackingId]),
    location: normalizeCell(cells[map.location]).toUpperCase(),
    status1: normalizeCell(cells[map.status1]),
    inProdFlag: normalizeCell(cells[map.inProdFlag]),
    orderId: normalizeCell(cells[map.orderId]),
    importSheetType: sheetType
  };
}

function createIgnoredRecord(record, reason) {
  return {
    lineNumber: record.lineNumber,
    reason,
    orderId: record.orderId,
    trackingId: record.trackingId
  };
}

function createValidationMessages(validRows) {
  const trackingToOrders = new Map();
  const orderToTracking = new Map();

  validRows.forEach((row) => {
    if (!trackingToOrders.has(row.trackingId)) {
      trackingToOrders.set(row.trackingId, new Set());
    }

    if (!orderToTracking.has(row.orderId)) {
      orderToTracking.set(row.orderId, new Set());
    }

    trackingToOrders.get(row.trackingId).add(row.orderId);
    orderToTracking.get(row.orderId).add(row.trackingId);
  });

  const errors = [];
  const warnings = [];

  trackingToOrders.forEach((orderIds, trackingId) => {
    if (orderIds.size > 1) {
      errors.push({
        type: 'TRACKING_TO_MULTIPLE_ORDERS',
        trackingId,
        orderIds: [...orderIds],
        message: `Tracking ID ${trackingId} maps to multiple order IDs: ${[...orderIds].join(', ')}`
      });
    }
  });

  orderToTracking.forEach((trackingIds, orderId) => {
    if (trackingIds.size > 1) {
      warnings.push({
        type: 'ORDER_TO_MULTIPLE_TRACKING_IDS',
        orderId,
        trackingIds: [...trackingIds],
        message: `Order ID ${orderId} has multiple tracking IDs: ${[...trackingIds].join(', ')}`
      });
    }
  });

  return {
    errors,
    warnings
  };
}

function aggregateRows(validRows) {
  const groups = new Map();

  validRows.forEach((row) => {
    if (!groups.has(row.trackingId)) {
      groups.set(row.trackingId, {
        trackingId: row.trackingId,
        orderId: row.orderId,
        date: row.date,
        productLines: [],
        sourceRows: []
      });
    }

    const aggregate = groups.get(row.trackingId);
    aggregate.productLines.push(row.product);

    aggregate.sourceRows.push(row);
  });

  return [...groups.values()]
    .map((item) => ({
      trackingId: item.trackingId,
      orderId: item.orderId,
      date: item.date,
      product: item.productLines.join(', '),
      productLines: item.productLines,
      sourceRows: item.sourceRows
    }))
    .sort((left, right) => left.orderId.localeCompare(right.orderId, undefined, { numeric: true }));
}

export function parseExcelPaste({ rawText, sheetType }) {
  const lines = String(rawText ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');

  const mappedRows = lines.map((line, index) => mapLineToRecord(line, sheetType, index + 1));
  const ignoredRows = [];
  const validRows = [];

  mappedRows.forEach((row) => {
    if (!row.orderId) {
      ignoredRows.push(createIgnoredRecord(row, 'Missing order ID.'));
      return;
    }

    if (!row.product) {
      ignoredRows.push(createIgnoredRecord(row, 'Missing product.'));
      return;
    }

    if (row.location !== 'VN') {
      ignoredRows.push(createIgnoredRecord(row, 'Location is not VN.'));
      return;
    }

    if (!row.trackingId) {
      ignoredRows.push(createIgnoredRecord(row, 'Tracking ID is missing.'));
      return;
    }

    if (!row.trackingId.startsWith('YT')) {
      ignoredRows.push(createIgnoredRecord(row, 'Tracking ID does not start with YT.'));
      return;
    }

    validRows.push(row);
  });

  const { errors, warnings } = createValidationMessages(validRows);
  const previewRows = aggregateRows(validRows);

  return {
    sheetType,
    inputRowCount: lines.length,
    parsedRowCount: mappedRows.length,
    validRowCount: validRows.length,
    ignoredRowCount: ignoredRows.length,
    aggregateCount: previewRows.length,
    validRows,
    ignoredRows,
    warnings,
    errors,
    previewRows,
    canCreateOrders: errors.length === 0 && warnings.length === 0 && previewRows.length > 0
  };
}
