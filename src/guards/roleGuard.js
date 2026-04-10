import { ROLE_PERMISSIONS } from '../constants/permissions.js';

export function hasRequiredRole(userRole, allowedRoles = []) {
  if (!allowedRoles.length) {
    return true;
  }

  return allowedRoles.includes(userRole);
}

export function canAccessRoute(route, currentUser) {
  if (!route?.requiresAuth) {
    return true;
  }

  if (!currentUser || currentUser.active === false) {
    return false;
  }

  if (!route.permission) {
    return true;
  }

  return hasPermission(currentUser.role, route.permission);
}

export function hasPermission(userRole, permission) {
  if (!userRole || !permission) {
    return false;
  }

  return (ROLE_PERMISSIONS[userRole] ?? []).includes(permission);
}

export function assertPermission(userRole, permission) {
  if (!hasPermission(userRole, permission)) {
    throw new Error(`Permission denied for ${permission}.`);
  }
}
