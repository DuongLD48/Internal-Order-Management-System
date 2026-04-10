export function renderNotFoundPage() {
  const section = document.createElement('section');
  section.className = 'page page--centered';

  section.innerHTML = `
    <div class="auth-card">
      <span class="eyebrow">404</span>
      <h2>Page not found</h2>
      <p class="page-copy">
        The requested route does not exist in the current application shell.
      </p>
    </div>
  `;

  return section;
}
