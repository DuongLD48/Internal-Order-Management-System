import { ORDER_STATUS } from '../constants/app.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { hasPermission } from '../guards/roleGuard.js';
import { logService, orderService, printService, systemLockService } from '../services/index.js';
import { renderOrderBulkActions } from '../components/OrderBulkActions.js';
import { renderOrderFilters } from '../components/OrderFilters.js';
import { renderOrderTable } from '../components/OrderTable.js';
import { renderOrderDetailDrawer } from '../components/OrderDetailDrawer.js';
import { renderEditOrderModal } from '../components/EditOrderModal.js';

let activeOrdersPageSession = null;
const ORDERS_PAGE_CACHE_KEY = 'orders-page-cache-v1';
const REALTIME_VISIBLE_ORDER_LIMIT = 200;

function readOrdersPageCache(uid) {
  if (!uid) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(ORDERS_PAGE_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (parsed?.uid !== uid) {
      return null;
    }

    return {
      search: String(parsed.search ?? ''),
      sortDirection: parsed.sortDirection === 'asc' ? 'asc' : 'desc',
      filters: {
        status: String(parsed.filters?.status ?? ''),
        completed: String(parsed.filters?.completed ?? ''),
        dateFrom: String(parsed.filters?.dateFrom ?? ''),
        dateTo: String(parsed.filters?.dateTo ?? ''),
        sheetType: String(parsed.filters?.sheetType ?? '')
      },
      allOrders: Array.isArray(parsed.allOrders) ? parsed.allOrders : []
    };
  } catch {
    return null;
  }
}

function writeOrdersPageCache(uid, payload) {
  if (!uid) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      ORDERS_PAGE_CACHE_KEY,
      JSON.stringify({
        uid,
        cachedAt: Date.now(),
        ...payload
      })
    );
  } catch {
    // Ignore sessionStorage failures and keep the page functional.
  }
}

function matchesSearch(order, searchValue) {
  if (!searchValue) {
    return true;
  }

  const normalizedNeedle = searchValue.toLowerCase();
  const haystack = [
    order.orderId,
    order.trackingId,
    ...(order.productLines ?? [])
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedNeedle);
}

function matchesCompletedFilter(order, completedFilter) {
  if (!completedFilter) {
    return true;
  }

  if (completedFilter === 'completed') {
    return order.isOrderCompleted === true;
  }

  if (completedFilter === 'open') {
    return order.isOrderCompleted === false;
  }

  return true;
}

function matchesStatusFilter(order, statusFilter) {
  if (!statusFilter) {
    return true;
  }

  return order.status === statusFilter;
}

function parseDisplayDateToKey(value) {
  const normalized = String(value ?? '').trim();
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);

  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }

  return month * 100 + day;
}

function matchesDateRangeFilter(order, dateFrom, dateTo) {
  const orderDateKey = parseDisplayDateToKey(order.date);

  if (orderDateKey === null) {
    return !dateFrom && !dateTo;
  }

  let fromKey = parseDisplayDateToKey(dateFrom);
  let toKey = parseDisplayDateToKey(dateTo);

  if (fromKey !== null && toKey !== null && fromKey > toKey) {
    [fromKey, toKey] = [toKey, fromKey];
  }

  if (fromKey !== null && orderDateKey < fromKey) {
    return false;
  }

  if (toKey !== null && orderDateKey > toKey) {
    return false;
  }

  return true;
}

function matchesSheetTypeFilter(order, sheetTypeFilter) {
  if (!sheetTypeFilter) {
    return true;
  }

  return order.importSheetType === sheetTypeFilter;
}

function compareOrderId(a, b) {
  return String(a.orderId ?? '').localeCompare(String(b.orderId ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function sortOrdersByOrderId(orders, direction) {
  const sorted = [...orders].sort(compareOrderId);
  return direction === 'asc' ? sorted : sorted.reverse();
}

function countByStatus(orders, status) {
  return orders.filter((order) => order.status === status).length;
}

function renderSummaryCards(orders) {
  const grid = document.createElement('div');
  grid.className = 'summary-grid';

  const cards = [
    ['Total Orders', String(orders.length)],
    ['Open', String(countByStatus(orders, ORDER_STATUS.OPEN))],
    ['Printed', String(countByStatus(orders, ORDER_STATUS.PRINTED))],
    ['Completed', String(countByStatus(orders, ORDER_STATUS.COMPLETED))],
    ['Cancelled', String(countByStatus(orders, ORDER_STATUS.CANCELLED))]
  ];

  cards.forEach(([label, value]) => {
    const item = document.createElement('article');
    item.className = 'summary-card';
    item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    grid.appendChild(item);
  });

  return grid;
}

function renderAccessDenied() {
  const section = document.createElement('section');
  section.className = 'page';
  section.innerHTML = `
    <article class="panel">
      <h3>Access denied</h3>
      <p>Your account cannot view orders.</p>
    </article>
  `;
  return section;
}

function renderProfileLoading() {
  const section = document.createElement('section');
  section.className = 'page';
  section.innerHTML = `
    <article class="panel">
      <h3>Loading</h3>
      <p>Please wait a moment.</p>
    </article>
  `;
  return section;
}

export function renderOrdersPage({ state }) {
  if (activeOrdersPageSession?.dispose) {
    activeOrdersPageSession.dispose();
    activeOrdersPageSession = null;
  }

  if (state.profileLoading) {
    return renderProfileLoading();
  }

  if (!hasPermission(state.currentUser?.role, PERMISSIONS.ORDERS_VIEW)) {
    return renderAccessDenied();
  }

  const section = document.createElement('section');
  section.className = 'page';

  const hero = document.createElement('div');
  hero.className = 'page-hero';
  hero.innerHTML = `
    <div>
      <span class="eyebrow">Orders</span>
      <h2>Order list</h2>
      <p class="page-copy">
        Search, filter, and open order details from this screen.
      </p>
    </div>
    <div class="hero-card">
      <strong>${state.currentUser?.role ?? 'viewer'}</strong>
      <span>${state.currentUser?.email ?? 'Unknown user'}</span>
    </div>
  `;

  const summaryMount = document.createElement('div');
  const actionsMount = document.createElement('div');
  const filtersMount = document.createElement('div');
  const tableMount = document.createElement('div');
  const drawerMount = document.createElement('div');
  const modalMount = document.createElement('div');

  section.appendChild(hero);
  section.appendChild(summaryMount);
  section.appendChild(actionsMount);
  section.appendChild(filtersMount);
  section.appendChild(tableMount);
  section.appendChild(drawerMount);
  section.appendChild(modalMount);

  const actor = state.currentUser;
  const cachedView = readOrdersPageCache(actor?.uid);

  const viewState = {
    loading: !cachedView,
    error: '',
    search: cachedView?.search ?? '',
    sortDirection: cachedView?.sortDirection ?? 'desc',
    filters: {
      status: cachedView?.filters?.status ?? '',
      completed: cachedView?.filters?.completed ?? '',
      dateFrom: cachedView?.filters?.dateFrom ?? '',
      dateTo: cachedView?.filters?.dateTo ?? '',
      sheetType: cachedView?.filters?.sheetType ?? ''
    },
    allOrders: cachedView?.allOrders ?? [],
    visibleOrders: [],
    selectedOrderId: '',
    selectedOrderIds: new Set(),
    actionLoading: false,
    actionError: '',
    actionMessage: '',
    importLock: null,
    detail: {
      open: false,
      orderId: '',
      loading: false,
      error: '',
      activeTab: 'info',
      order: null,
      logs: []
    },
    edit: {
      open: false,
      loading: false,
      error: '',
      order: null
    },
    focus: {
      field: '',
      selectionStart: null,
      selectionEnd: null
    }
  };

  const session = {
    disposed: false,
    unsubscribeVisibleOrders: null,
    unsubscribeDetailOrder: null,
    visibleSubscriptionKey: '',
    disconnectObserver: null,
    dispose() {
      this.disposed = true;

      if (typeof this.unsubscribeVisibleOrders === 'function') {
        this.unsubscribeVisibleOrders();
        this.unsubscribeVisibleOrders = null;
        this.visibleSubscriptionKey = '';
      }

      if (typeof this.unsubscribeDetailOrder === 'function') {
        this.unsubscribeDetailOrder();
        this.unsubscribeDetailOrder = null;
      }

      if (typeof this.disconnectObserver === 'function') {
        this.disconnectObserver();
        this.disconnectObserver = null;
      }
    }
  };
  activeOrdersPageSession = session;

  const disconnectObserver = new MutationObserver(() => {
    if (!section.isConnected) {
      session.dispose();

      if (activeOrdersPageSession === session) {
        activeOrdersPageSession = null;
      }
    }
  });
  disconnectObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  session.disconnectObserver = () => disconnectObserver.disconnect();

  const isPrintBlocked = () => Boolean(viewState.importLock?.active);

  const syncVisibleOrderSubscriptions = () => {
    const visibleRealtimeIds = viewState.visibleOrders
      .slice(0, REALTIME_VISIBLE_ORDER_LIMIT)
      .map((order) => order.orderId);
    const nextKey = [...visibleRealtimeIds].sort().join('|');

    if (nextKey === session.visibleSubscriptionKey) {
      return;
    }

    if (typeof session.unsubscribeVisibleOrders === 'function') {
      session.unsubscribeVisibleOrders();
      session.unsubscribeVisibleOrders = null;
      session.visibleSubscriptionKey = '';
    }

    if (!visibleRealtimeIds.length) {
      return;
    }

    session.visibleSubscriptionKey = nextKey;
    session.unsubscribeVisibleOrders = orderService.subscribeOrdersByIds(
      visibleRealtimeIds,
      actor,
      (updatedOrders) => {
        if (session.disposed || !updatedOrders.length) {
          return;
        }

        const updatedById = new Map(updatedOrders.map((order) => [order.orderId, order]));
        viewState.allOrders = viewState.allOrders.map((order) =>
          updatedById.get(order.orderId) ?? order
        );
        applyClientFilters();
        renderPageSections();
      }
    );
  };

  const applyClientFilters = () => {
    viewState.visibleOrders = viewState.allOrders
      .filter(
        (order) =>
          matchesSearch(order, viewState.search) &&
          matchesStatusFilter(order, viewState.filters.status) &&
          matchesCompletedFilter(order, viewState.filters.completed) &&
          matchesDateRangeFilter(order, viewState.filters.dateFrom, viewState.filters.dateTo) &&
          matchesSheetTypeFilter(order, viewState.filters.sheetType)
      )
      ;

    viewState.visibleOrders = sortOrdersByOrderId(viewState.visibleOrders, viewState.sortDirection);

    if (viewState.detail.open && viewState.detail.orderId) {
      const liveOrder = viewState.allOrders.find((order) => order.orderId === viewState.detail.orderId);

      if (liveOrder) {
        viewState.detail.order = liveOrder;
      }
    }

    if (
      viewState.detail.open &&
      viewState.detail.orderId &&
      !viewState.visibleOrders.some((order) => order.orderId === viewState.detail.orderId)
    ) {
      if (typeof session.unsubscribeDetailOrder === 'function') {
        session.unsubscribeDetailOrder();
        session.unsubscribeDetailOrder = null;
      }

      viewState.detail.open = false;
      viewState.detail.orderId = '';
      viewState.detail.order = null;
      viewState.detail.logs = [];
    }

    viewState.selectedOrderIds = new Set(
      [...viewState.selectedOrderIds].filter((orderId) =>
        viewState.allOrders.some((order) => order.orderId === orderId)
      )
    );

    writeOrdersPageCache(actor?.uid, {
      search: viewState.search,
      sortDirection: viewState.sortDirection,
      filters: viewState.filters,
      allOrders: viewState.allOrders
    });

    syncVisibleOrderSubscriptions();
  };

  const closeDrawer = () => {
    if (typeof session.unsubscribeDetailOrder === 'function') {
      session.unsubscribeDetailOrder();
      session.unsubscribeDetailOrder = null;
    }

    viewState.detail.open = false;
    viewState.detail.orderId = '';
    viewState.detail.error = '';
    viewState.detail.loading = false;
    viewState.detail.order = null;
    viewState.detail.logs = [];
    viewState.detail.activeTab = 'info';
    renderPageSections();
  };

  const closeEditModal = () => {
    viewState.edit.open = false;
    viewState.edit.loading = false;
    viewState.edit.error = '';
    viewState.edit.order = null;
    renderPageSections();
  };

  const openOrderDrawer = async (orderId) => {
    if (!hasPermission(actor?.role, PERMISSIONS.ORDERS_VIEW)) {
      return;
    }

    viewState.selectedOrderId = orderId;
    viewState.detail.open = true;
    viewState.detail.orderId = orderId;
    viewState.detail.loading = true;
    viewState.detail.error = '';
    viewState.detail.activeTab = 'info';
    viewState.detail.order = null;
    viewState.detail.logs = [];
    renderPageSections();

    if (typeof session.unsubscribeDetailOrder === 'function') {
      session.unsubscribeDetailOrder();
      session.unsubscribeDetailOrder = null;
    }

    session.unsubscribeDetailOrder = orderService.subscribeOrderById(
      orderId,
      actor,
      (order) => {
        if (session.disposed || viewState.detail.orderId !== orderId) {
          return;
        }

        if (!order) {
          viewState.detail.error = `Order ${orderId} no longer exists.`;
          viewState.detail.loading = false;
          viewState.detail.order = null;
          renderPageSections();
          return;
        }

        viewState.detail.order = order;
        viewState.detail.loading = false;
        viewState.detail.error = '';
        renderPageSections();
      },
      (error) => {
        if (session.disposed || viewState.detail.orderId !== orderId) {
          return;
        }

        viewState.detail.error = error.message || 'Failed to subscribe order detail.';
        viewState.detail.loading = false;
        renderPageSections();
      }
    );

    try {
      const tasks = [];

      if (hasPermission(actor?.role, PERMISSIONS.LOGS_VIEW)) {
        tasks.push(logService.getOrderLogs(orderId, actor));
      }

      const [logs = []] = await Promise.all(tasks);
      viewState.detail.logs = logs;
    } catch (error) {
      viewState.detail.error = error.message || 'Failed to load order detail.';
    } finally {
      renderPageSections();
    }
  };

  const unprintedVisibleOrders = () =>
    viewState.visibleOrders.filter((order) => !order.isPrintOrder && order.status !== ORDER_STATUS.CANCELLED);

  const findOrdersByIds = (orderIds) =>
    orderIds
      .map((orderId) => viewState.allOrders.find((order) => order.orderId === orderId))
      .filter(Boolean);

  const fetchLatestOrdersByIds = async (orderIds) => {
    const uniqueIds = [...new Set(orderIds)];
    const latestOrders = await Promise.all(
      uniqueIds.map((orderId) => orderService.getOrderById(orderId, actor))
    );

    return latestOrders.filter(Boolean);
  };

  const reloadDrawerIfNeeded = async () => {
    if (viewState.detail.open && viewState.detail.orderId) {
      await openOrderDrawer(viewState.detail.orderId);
    }
  };

  const runOrderAction = async (runner, successMessage) => {
    viewState.actionLoading = true;
    viewState.actionError = '';
    viewState.actionMessage = '';
    renderPageSections();

    try {
      await runner();
      viewState.actionMessage = successMessage;
      await reloadDrawerIfNeeded();
    } catch (error) {
      viewState.actionError = error.message || 'Order action failed.';
    } finally {
      viewState.actionLoading = false;
      renderPageSections();
    }
  };

  const refreshImportLock = async () => {
    try {
      viewState.importLock = await systemLockService.getImportLock(actor);
    } catch (_error) {
      viewState.importLock = null;
    }
  };

  const blockPrintIfImportRunning = async () => {
    await refreshImportLock();

    if (isPrintBlocked()) {
      viewState.actionError = systemLockService.getImportLockMessage(viewState.importLock);
      viewState.actionMessage = '';
      renderPageSections();
      return true;
    }

    return false;
  };

  const renderPageSections = () => {
    summaryMount.innerHTML = '';
    summaryMount.appendChild(renderSummaryCards(viewState.visibleOrders));

    actionsMount.innerHTML = '';
    actionsMount.appendChild(
      renderOrderBulkActions({
        selectedCount: viewState.selectedOrderIds.size,
        unprintedCount: unprintedVisibleOrders().length,
        canPrint: hasPermission(actor?.role, PERMISSIONS.ORDERS_PRINT),
        printBlockedReason: isPrintBlocked() ? systemLockService.getImportLockMessage(viewState.importLock) : '',
        actionLoading: viewState.actionLoading,
        actionMessage: viewState.actionMessage,
        actionError: viewState.actionError,
        onPrintSelected: async () => {
          if (!hasPermission(actor?.role, PERMISSIONS.ORDERS_PRINT)) {
            return;
          }

          if (await blockPrintIfImportRunning()) {
            return;
          }

          const ids = [...viewState.selectedOrderIds];

          await runOrderAction(
            async () => {
              const ordersToPrint = await fetchLatestOrdersByIds(ids);
              printService.openPrintWindow(ordersToPrint);
              await orderService.printOrders(ids, actor);
            },
            `Opened ${ids.length} selected labels and updated print status.`
          );
        },
        onPrintUnprinted: async () => {
          if (!hasPermission(actor?.role, PERMISSIONS.ORDERS_PRINT)) {
            return;
          }

          if (await blockPrintIfImportRunning()) {
            return;
          }

          const ids = unprintedVisibleOrders().map((order) => order.orderId);
          await runOrderAction(
            async () => {
              const ordersToPrint = await fetchLatestOrdersByIds(ids);
              printService.openPrintWindow(ordersToPrint);
              await orderService.printOrders(ids, actor);
            },
            `Opened ${ids.length} visible unprinted labels and updated print status.`
          );
        },
        onClearSelection: () => {
          viewState.selectedOrderIds = new Set();
          renderPageSections();
        }
      })
    );

    filtersMount.innerHTML = '';
    filtersMount.appendChild(
      renderOrderFilters({
        search: viewState.search,
        filters: viewState.filters,
        disabled: viewState.loading,
        onSearchChange: (value) => {
          const activeInput = document.activeElement;
          viewState.focus = {
            field: 'search',
            selectionStart: activeInput?.selectionStart ?? null,
            selectionEnd: activeInput?.selectionEnd ?? null
          };
          viewState.search = value;
          applyClientFilters();
          renderPageSections();
        },
        onFilterChange: (key, value) => {
          const activeInput = document.activeElement;
          viewState.focus = {
            field: key,
            selectionStart: activeInput?.selectionStart ?? null,
            selectionEnd: activeInput?.selectionEnd ?? null
          };
          viewState.filters[key] = value;
          applyClientFilters();
          renderPageSections();
        }
      })
    );

    if (viewState.focus.field) {
      queueMicrotask(() => {
        const target = filtersMount.querySelector(`[data-order-filter="${viewState.focus.field}"]`);
        if (!target) {
          return;
        }

        target.focus();

        if (
          typeof viewState.focus.selectionStart === 'number' &&
          typeof target.setSelectionRange === 'function'
        ) {
          target.setSelectionRange(viewState.focus.selectionStart, viewState.focus.selectionEnd ?? viewState.focus.selectionStart);
        }
      });
    }

    tableMount.innerHTML = '';
    tableMount.appendChild(
      renderOrderTable({
        orders: viewState.visibleOrders,
        loading: viewState.loading,
        error: viewState.error,
        sortDirection: viewState.sortDirection,
        selectedOrderId: viewState.selectedOrderId,
        selectedOrderIds: viewState.selectedOrderIds,
        onToggleOrderIdSort: () => {
          viewState.sortDirection = viewState.sortDirection === 'desc' ? 'asc' : 'desc';
          applyClientFilters();
          renderPageSections();
        },
        onSelect: (order) => {
          if (!hasPermission(actor?.role, PERMISSIONS.ORDERS_VIEW)) {
            return;
          }

          void openOrderDrawer(order.orderId);
        },
        onToggleSelect: (orderId, checked) => {
          if (checked) {
            viewState.selectedOrderIds.add(orderId);
          } else {
            viewState.selectedOrderIds.delete(orderId);
          }

          renderPageSections();
        },
        onToggleSelectAll: (checked) => {
          if (checked) {
            viewState.visibleOrders.forEach((order) => viewState.selectedOrderIds.add(order.orderId));
          } else {
            viewState.visibleOrders.forEach((order) => viewState.selectedOrderIds.delete(order.orderId));
          }

          renderPageSections();
        }
      })
    );

    drawerMount.innerHTML = '';
    drawerMount.appendChild(
      renderOrderDetailDrawer({
        open: viewState.detail.open,
        detailState: viewState.detail,
        actionLoading: viewState.actionLoading,
        actor,
        printBlockedReason: isPrintBlocked() ? systemLockService.getImportLockMessage(viewState.importLock) : '',
        onClose: closeDrawer,
        onTabChange: (tab) => {
          if (tab === 'logs' && !hasPermission(actor?.role, PERMISSIONS.LOGS_VIEW)) {
            return;
          }

          viewState.detail.activeTab = tab;
          renderPageSections();
        },
        onEdit: (order) => {
          if (!order || !hasPermission(actor?.role, PERMISSIONS.ORDERS_EDIT)) {
            return;
          }

          viewState.edit.open = true;
          viewState.edit.loading = false;
          viewState.edit.error = '';
          viewState.edit.order = order;
          renderPageSections();
        },
        onUpdateProductItems: async (payloads) => {
          if (!viewState.detail.order || !hasPermission(actor?.role, PERMISSIONS.ORDERS_ITEM_UPDATE)) {
            return;
          }

          if (!Array.isArray(payloads) || !payloads.length) {
            viewState.actionError = '';
            viewState.actionMessage = 'No product item changes to save.';
            renderPageSections();
            return;
          }

          await runOrderAction(
            async () => {
              await orderService.updateProductItems(viewState.detail.order.orderId, payloads, actor);
            },
            `Updated ${payloads.length} product line(s) in ${viewState.detail.order.orderId}.`
          );
        },
        onPrint: async (order) => {
          if (!order || !hasPermission(actor?.role, PERMISSIONS.ORDERS_PRINT)) {
            return;
          }

          if (await blockPrintIfImportRunning()) {
            return;
          }

          await runOrderAction(
            async () => {
              const latestOrders = await fetchLatestOrdersByIds([order.orderId]);
              printService.openPrintWindow(latestOrders);
              await orderService.printOrders([order.orderId], actor);
            },
            `Opened label for ${order.orderId} and updated print status.`
          );
        },
        onComplete: async (order) => {
          if (!order || !hasPermission(actor?.role, PERMISSIONS.ORDERS_COMPLETE)) {
            return;
          }

          if (!window.confirm(`Mark order ${order.orderId} as completed?`)) {
            return;
          }

          await runOrderAction(
            async () => {
              await orderService.completeOrder(order.orderId, actor);
            },
            `Completed order ${order.orderId}.`
          );
        },
        onCancel: async (order) => {
          if (!order || !hasPermission(actor?.role, PERMISSIONS.ORDERS_CANCEL)) {
            return;
          }

          if (!window.confirm(`Cancel order ${order.orderId}?`)) {
            return;
          }

          await runOrderAction(
            async () => {
              await orderService.cancelOrder(order.orderId, actor);
            },
            `Cancelled order ${order.orderId}.`
          );
        }
      })
    );

    modalMount.innerHTML = '';
    modalMount.appendChild(
      renderEditOrderModal({
        open: viewState.edit.open,
        order: viewState.edit.order,
        loading: viewState.edit.loading,
        error: viewState.edit.error,
        onClose: closeEditModal,
        onSave: async (formValues) => {
          if (!viewState.edit.order || !hasPermission(actor?.role, PERMISSIONS.ORDERS_EDIT)) {
            return;
          }

          viewState.edit.loading = true;
          viewState.edit.error = '';
          renderPageSections();

          try {
            await orderService.updateOrder(
              viewState.edit.order.orderId,
              {
                date: formValues.date,
                trackingId: formValues.trackingId,
                productLines: formValues.product.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
              },
              actor,
              {
                expectedVersion: viewState.edit.order.version ?? 1
              }
            );

            viewState.actionMessage = `Updated order ${viewState.edit.order.orderId}.`;
            viewState.actionError = '';
            await reloadDrawerIfNeeded();
            closeEditModal();
          } catch (error) {
            viewState.edit.error = error.message || 'Failed to update order.';
          } finally {
            viewState.edit.loading = false;
            renderPageSections();
          }
        }
      })
    );
  };

  const initOrdersData = async () => {
    if (!hasPermission(actor?.role, PERMISSIONS.ORDERS_VIEW)) {
      viewState.error = 'Orders permission is required.';
      renderPageSections();
      return;
    }

    if (!cachedView) {
      viewState.loading = true;
      viewState.error = '';
      renderPageSections();
    }

    try {
      await refreshImportLock();
      viewState.allOrders = await orderService.listOrders(
        orderService.getDashboardOrdersWindow(),
        actor
      );
      applyClientFilters();
      viewState.loading = false;
      viewState.error = '';
      renderPageSections();
    } catch (error) {
      viewState.error = error.message || 'Failed to load orders.';
      viewState.allOrders = [];
      viewState.visibleOrders = [];
      viewState.selectedOrderId = '';
      viewState.selectedOrderIds = new Set();
      viewState.loading = false;
      renderPageSections();
    }
  };

  applyClientFilters();
  renderPageSections();
  void initOrdersData();

  return section;
}
