export function renderSeedPage() {
  const section = document.createElement('section');
  section.className = 'page';
  section.innerHTML = `
    <article class="panel">
      <h3>Seed Disabled</h3>
      <p>This test page has been disabled and should not be published in the production repository.</p>
    </article>
  `;

  return section;
}
