import { ROUTE_PATHS } from '../constants/routes.js';

export function renderHeader({
  appName,
  currentRoute,
  currentUser,
  logoutLoading,
  onNavigate,
  onLogout
}) {
  const header = document.createElement('header');
  header.className = 'topbar';

  const titleBlock = document.createElement('div');
  titleBlock.className = 'topbar__title-block';

  const title = document.createElement('h1');
  title.className = 'topbar__title';
  title.textContent = appName;

  const subtitle = document.createElement('p');
  subtitle.className = 'topbar__subtitle';
  subtitle.textContent = currentRoute?.label ?? 'Dashboard';

  titleBlock.appendChild(title);
  titleBlock.appendChild(subtitle);

  const userBlock = document.createElement('div');
  userBlock.className = 'topbar__user';

  const badge = document.createElement('span');
  badge.className = 'topbar__status';
  badge.textContent = currentUser ? 'Authenticated' : 'Guest mode';

  const description = document.createElement('span');
  description.className = 'topbar__user-text';
  description.textContent = currentUser
    ? `${currentUser.email}${currentUser.role ? ` • ${currentUser.role}` : ''}`
    : 'Please sign in to continue';

  userBlock.appendChild(badge);
  userBlock.appendChild(description);

  const actionButton = document.createElement('button');
  actionButton.type = 'button';
  actionButton.className = `button ${currentUser ? 'button--secondary' : 'button--primary'} topbar__action`;

  if (currentUser) {
    actionButton.textContent = logoutLoading ? 'Signing out...' : 'Logout';
    actionButton.disabled = logoutLoading;
    actionButton.addEventListener('click', () => {
      onLogout?.();
    });
  } else {
    actionButton.textContent = 'Go to Login';
    actionButton.addEventListener('click', () => {
      onNavigate?.(ROUTE_PATHS.LOGIN);
    });
  }

  userBlock.appendChild(actionButton);

  header.appendChild(titleBlock);
  header.appendChild(userBlock);

  return header;
}
