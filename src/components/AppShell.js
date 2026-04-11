import { ROUTE_PATHS } from '../constants/routes.js';
import { renderHeader } from './Header.js';
import { renderSidebar } from './Sidebar.js';
import { renderLoginPage } from '../pages/LoginPage.js';
import { renderOrdersPage } from '../pages/OrdersPage.js';
import { renderImportPage } from '../pages/ImportPage.js';
import { renderPrintLogsPage } from '../pages/PrintLogsPage.js';
import { renderTrackingCompletePage } from '../pages/TrackingCompletePage.js';
import { renderCompleteLogsPage } from '../pages/CompleteLogsPage.js';
import { renderUsersPage } from '../pages/UsersPage.js';
import { renderNotFoundPage } from '../pages/NotFoundPage.js';

const PAGE_RENDERERS = {
  [ROUTE_PATHS.LOGIN]: renderLoginPage,
  [ROUTE_PATHS.ORDERS]: renderOrdersPage,
  [ROUTE_PATHS.IMPORT]: renderImportPage,
  [ROUTE_PATHS.PRINT_LOGS]: renderPrintLogsPage,
  [ROUTE_PATHS.TRACKING_COMPLETE]: renderTrackingCompletePage,
  [ROUTE_PATHS.COMPLETE_LOGS]: renderCompleteLogsPage,
  [ROUTE_PATHS.USERS]: renderUsersPage
};

export function renderAppShell({
  appName,
  route,
  state,
  onNavigate,
  onLogin,
  onLogout
}) {
  const shell = document.createElement('div');
  shell.className = 'app-shell';

  const header = renderHeader({
    appName,
    currentRoute: route,
    currentUser: state.currentUser,
    logoutLoading: state.logoutLoading,
    onNavigate,
    onLogout
  });

  const mainLayout = document.createElement('div');
  mainLayout.className = 'app-layout';

  const sidebar = renderSidebar({
    currentPath: route.path,
    currentUser: state.currentUser,
    onNavigate
  });

  const content = document.createElement('main');
  content.className = 'app-content';

  const renderer = PAGE_RENDERERS[route.path] ?? renderNotFoundPage;
  if (!state.authResolved && route.requiresAuth) {
    const loadingCard = document.createElement('section');
    loadingCard.className = 'page page--centered';
    loadingCard.innerHTML = `
      <div class="auth-card">
        <span class="eyebrow">Loading</span>
        <h2>Loading data</h2>
        <p class="page-copy">Please wait a moment.</p>
      </div>
    `;
    content.appendChild(loadingCard);
  } else {
    content.appendChild(
      renderer({
        route,
        state,
        onNavigate,
        onLogin,
        onLogout
      })
    );
  }

  mainLayout.appendChild(sidebar);
  mainLayout.appendChild(content);

  shell.appendChild(header);

  if (!state.firebaseReady) {
    const alert = document.createElement('div');
    alert.className = 'env-alert';
    alert.innerHTML = `
      <strong>The system is temporarily unavailable.</strong>
      <span>Please contact your administrator.</span>
    `;
    shell.appendChild(alert);
  }

  shell.appendChild(mainLayout);

  return shell;
}
