import { ROUTES, ROUTE_PATHS } from '../constants/routes.js';

function normalizePath(path) {
  if (!path) {
    return ROUTE_PATHS.ORDERS;
  }

  const trimmed = path.startsWith('#') ? path.slice(1) : path;

  if (trimmed === '') {
    return ROUTE_PATHS.ORDERS;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function getRouteByPath(path) {
  const normalizedPath = normalizePath(path);
  return ROUTES.find((route) => route.path === normalizedPath) ?? ROUTES[0];
}

export function navigateTo(path) {
  const normalizedPath = normalizePath(path);

  if (location.hash === `#${normalizedPath}`) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }

  location.hash = normalizedPath;
}

export function initRouter(onRouteChange) {
  const handleRouteChange = () => {
    const route = getRouteByPath(location.hash);
    onRouteChange(route);
  };

  window.addEventListener('hashchange', handleRouteChange);

  if (!location.hash) {
    navigateTo(ROUTE_PATHS.ORDERS);
    return;
  }

  handleRouteChange();
}
