import { NAVIGATION_ITEMS } from '../constants/routes.js';
import { hasPermission } from '../guards/roleGuard.js';

export function renderSidebar({ currentPath, currentUser, onNavigate }) {
  const aside = document.createElement('aside');
  aside.className = 'sidebar';

  const nav = document.createElement('nav');
  nav.className = 'sidebar__nav';

  NAVIGATION_ITEMS.filter((item) => {
    if (item.path === '/login') {
      return !currentUser;
    }

    if (!item.permission) {
      return true;
    }

    return hasPermission(currentUser?.role, item.permission);
  }).forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sidebar__link${item.path === currentPath ? ' is-active' : ''}`;
    button.textContent = item.label;
    button.addEventListener('click', () => onNavigate(item.path));
    nav.appendChild(button);
  });

  const note = document.createElement('div');
  note.className = 'sidebar__note';
  note.innerHTML = `
    <strong>Production-minded</strong>
    <p>Role-aware navigation, Firebase-first data flow, and internal order tooling are ready for daily use.</p>
  `;

  aside.appendChild(nav);
  aside.appendChild(note);

  return aside;
}
