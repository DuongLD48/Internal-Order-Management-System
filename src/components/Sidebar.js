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
    <strong>Quick Note</strong>
    <p>Select a section to continue your work.</p>
  `;

  aside.appendChild(nav);
  aside.appendChild(note);

  return aside;
}
