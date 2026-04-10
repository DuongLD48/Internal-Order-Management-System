import { PERMISSIONS } from './permissions.js';

export const ROUTE_PATHS = {
  ORDERS: '/',
  LOGIN: '/login',
  IMPORT: '/import',
  PRINT_LOGS: '/print-logs',
  TRACKING_COMPLETE: '/tracking-complete',
  COMPLETE_LOGS: '/complete-logs',
  USERS: '/users'
};

export const ROUTES = [
  {
    path: ROUTE_PATHS.ORDERS,
    label: 'Orders',
    requiresAuth: true,
    permission: PERMISSIONS.ORDERS_VIEW
  },
  {
    path: ROUTE_PATHS.LOGIN,
    label: 'Login',
    requiresAuth: false
  },
  {
    path: ROUTE_PATHS.IMPORT,
    label: 'Import Orders',
    requiresAuth: true,
    permission: PERMISSIONS.ORDERS_IMPORT
  },
  {
    path: ROUTE_PATHS.PRINT_LOGS,
    label: 'Print Logs',
    requiresAuth: true,
    permission: PERMISSIONS.LOGS_VIEW
  },
  {
    path: ROUTE_PATHS.TRACKING_COMPLETE,
    label: 'Complete By Tracking',
    requiresAuth: true,
    permission: PERMISSIONS.ORDERS_COMPLETE
  },
  {
    path: ROUTE_PATHS.COMPLETE_LOGS,
    label: 'Complete Logs',
    requiresAuth: true,
    permission: PERMISSIONS.LOGS_VIEW
  },
  {
    path: ROUTE_PATHS.USERS,
    label: 'Users',
    requiresAuth: true,
    permission: PERMISSIONS.USERS_VIEW
  }
];

export const NAVIGATION_ITEMS = [
  {
    path: ROUTE_PATHS.ORDERS,
    label: 'Orders',
    permission: PERMISSIONS.ORDERS_VIEW
  },
  {
    path: ROUTE_PATHS.IMPORT,
    label: 'Import Orders',
    permission: PERMISSIONS.ORDERS_IMPORT
  },
  {
    path: ROUTE_PATHS.PRINT_LOGS,
    label: 'Print Logs',
    permission: PERMISSIONS.LOGS_VIEW
  },
  {
    path: ROUTE_PATHS.TRACKING_COMPLETE,
    label: 'Complete By Tracking',
    permission: PERMISSIONS.ORDERS_COMPLETE
  },
  {
    path: ROUTE_PATHS.COMPLETE_LOGS,
    label: 'Complete Logs',
    permission: PERMISSIONS.LOGS_VIEW
  },
  {
    path: ROUTE_PATHS.USERS,
    label: 'Users',
    permission: PERMISSIONS.USERS_VIEW
  },
  {
    path: ROUTE_PATHS.LOGIN,
    label: 'Login'
  }
];
