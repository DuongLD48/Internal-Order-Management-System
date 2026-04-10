import { ROLE_OPTIONS } from '../constants/app.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { hasPermission } from '../guards/roleGuard.js';
import { userService } from '../services/index.js';

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return '-';
  }

  return new Date(timestamp).toLocaleString();
}

function renderProfileLoading() {
  const section = document.createElement('section');
  section.className = 'page';
  section.innerHTML = `
    <article class="panel">
      <h3>Loading profile</h3>
      <p>Waiting for users/{uid} profile to resolve user-management permissions.</p>
    </article>
  `;
  return section;
}

function renderAccessDenied() {
  const section = document.createElement('section');
  section.className = 'page';
  section.innerHTML = `
    <article class="panel">
      <h3>Users Access Denied</h3>
      <p>Only admins can view and manage user profile documents.</p>
    </article>
  `;
  return section;
}

function countUsersByRole(users, role) {
  return users.filter((user) => user.role === role).length;
}

function renderSummary(users) {
  const grid = document.createElement('div');
  grid.className = 'summary-grid';

  [
    ['Total Users', String(users.length)],
    ['Admins', String(countUsersByRole(users, 'admin'))],
    ['Staff', String(countUsersByRole(users, 'staff'))],
    ['Inactive', String(users.filter((user) => !user.active).length)]
  ].forEach(([label, value]) => {
    const card = document.createElement('article');
    card.className = 'summary-card';
    card.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    grid.appendChild(card);
  });

  return grid;
}

export function renderUsersPage({ state }) {
  if (state.profileLoading) {
    return renderProfileLoading();
  }

  if (!hasPermission(state.currentUser?.role, PERMISSIONS.USERS_VIEW)) {
    return renderAccessDenied();
  }

  const section = document.createElement('section');
  section.className = 'page';

  const hero = document.createElement('div');
  hero.className = 'page-hero';
  hero.innerHTML = `
    <div>
      <span class="eyebrow">Admin</span>
      <h2>User management</h2>
      <p class="page-copy">
        Manage Firestore profile documents for authenticated users, update roles, and toggle active state.
      </p>
    </div>
    <div class="hero-card">
      <strong>${state.currentUser?.role ?? 'viewer'}</strong>
      <span>${state.currentUser?.email ?? 'Unknown user'}</span>
    </div>
  `;

  const summaryMount = document.createElement('div');
  const formMount = document.createElement('div');
  const listMount = document.createElement('div');

  section.appendChild(hero);
  section.appendChild(summaryMount);
  section.appendChild(formMount);
  section.appendChild(listMount);

  const actor = state.currentUser;
  const canManage = hasPermission(actor?.role, PERMISSIONS.USERS_MANAGE);
  const viewState = {
    loading: true,
    saving: false,
    rowLoadingUid: '',
    error: '',
    message: '',
    users: [],
    search: '',
    draftRoles: {},
    form: {
      uid: '',
      email: '',
      name: '',
      role: 'viewer',
      active: true
    }
  };

  const getVisibleUsers = () => {
    const needle = viewState.search.trim().toLowerCase();

    if (!needle) {
      return viewState.users;
    }

    return viewState.users.filter((user) =>
      [user.uid, user.email, user.name, user.role].join(' ').toLowerCase().includes(needle)
    );
  };

  const resetForm = () => {
    viewState.form = {
      uid: '',
      email: '',
      name: '',
      role: 'viewer',
      active: true
    };
  };

  const renderPage = () => {
    const visibleUsers = getVisibleUsers();

    summaryMount.innerHTML = '';
    summaryMount.appendChild(renderSummary(viewState.users));

    formMount.innerHTML = '';
    if (canManage) {
      const formPanel = document.createElement('article');
      formPanel.className = 'panel';
      formPanel.innerHTML = `
        <h3>Upsert User Profile</h3>
        <p>Create or update <code>users/{uid}</code> after the authentication account already exists.</p>
      `;

      const form = document.createElement('form');
      form.className = 'form-grid';
      form.innerHTML = `
        <div class="user-form-grid">
          <label class="field">
            <span>UID</span>
            <input name="uid" value="${viewState.form.uid}" ${viewState.saving ? 'disabled' : ''} />
          </label>
          <label class="field">
            <span>Email</span>
            <input name="email" type="email" value="${viewState.form.email}" ${viewState.saving ? 'disabled' : ''} />
          </label>
          <label class="field">
            <span>Name</span>
            <input name="name" value="${viewState.form.name}" ${viewState.saving ? 'disabled' : ''} />
          </label>
          <label class="field">
            <span>Role</span>
            <select name="role" ${viewState.saving ? 'disabled' : ''}>
              ${ROLE_OPTIONS.map((role) => `<option value="${role}" ${role === viewState.form.role ? 'selected' : ''}>${role}</option>`).join('')}
            </select>
          </label>
        </div>
      `;

      const checkboxRow = document.createElement('label');
      checkboxRow.className = 'checkbox-row checkbox-row--visible';
      checkboxRow.innerHTML = `
        <input type="checkbox" name="active" ${viewState.form.active ? 'checked' : ''} ${viewState.saving ? 'disabled' : ''} />
        <span>Active user profile</span>
      `;

      const feedback = document.createElement('div');
      feedback.className = `form-feedback${viewState.error ? ' is-error' : ''}`;
      feedback.textContent = viewState.error || viewState.message || ' ';

      const actions = document.createElement('div');
      actions.className = 'modal-actions';

      const resetButton = document.createElement('button');
      resetButton.type = 'button';
      resetButton.className = 'button button--secondary';
      resetButton.textContent = 'Reset';
      resetButton.disabled = viewState.saving;
      resetButton.addEventListener('click', () => {
        resetForm();
        viewState.error = '';
        viewState.message = '';
        renderPage();
      });

      const submitButton = document.createElement('button');
      submitButton.type = 'submit';
      submitButton.className = 'button button--primary';
      submitButton.disabled = viewState.saving;
      submitButton.textContent = viewState.saving ? 'Saving...' : 'Save Profile';

      actions.appendChild(resetButton);
      actions.appendChild(submitButton);
      form.appendChild(checkboxRow);
      form.appendChild(feedback);
      form.appendChild(actions);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!hasPermission(actor?.role, PERMISSIONS.USERS_MANAGE)) {
          return;
        }

        const formData = new FormData(form);
        viewState.form = {
          uid: String(formData.get('uid') ?? '').trim(),
          email: String(formData.get('email') ?? '').trim(),
          name: String(formData.get('name') ?? '').trim(),
          role: String(formData.get('role') ?? 'viewer'),
          active: formData.get('active') === 'on'
        };

        viewState.saving = true;
        viewState.error = '';
        viewState.message = '';
        renderPage();

        try {
          await userService.upsertUserProfile(viewState.form, actor);
          viewState.message = `Saved profile ${viewState.form.uid}.`;
          resetForm();
          await loadUsers();
        } catch (error) {
          viewState.error = error.message || 'Failed to save user profile.';
        } finally {
          viewState.saving = false;
          renderPage();
        }
      });

      formPanel.appendChild(form);
      formMount.appendChild(formPanel);
    }

    listMount.innerHTML = '';
    const listPanel = document.createElement('article');
    listPanel.className = 'panel';
    listPanel.innerHTML = `
      <h3>Accounts</h3>
      <p>Search by name, email, uid, or role. Role and active changes are protected on both UI and service layer.</p>
    `;

    const searchLabel = document.createElement('label');
    searchLabel.className = 'field';
    searchLabel.innerHTML = `
      <span>Search users</span>
      <input placeholder="Search by email, uid, name, role" value="${viewState.search}" ${viewState.loading ? 'disabled' : ''} />
    `;
    searchLabel.querySelector('input').addEventListener('input', (event) => {
      viewState.search = event.target.value;
      renderPage();
    });
    listPanel.appendChild(searchLabel);

    if (viewState.loading) {
      const loading = document.createElement('div');
      loading.className = 'table-state';
      loading.textContent = 'Loading users...';
      listPanel.appendChild(loading);
    } else if (viewState.error && !viewState.users.length) {
      const error = document.createElement('div');
      error.className = 'table-state is-error';
      error.textContent = viewState.error;
      listPanel.appendChild(error);
    } else if (!visibleUsers.length) {
      const empty = document.createElement('div');
      empty.className = 'detail-empty';
      empty.textContent = 'No user profiles found.';
      listPanel.appendChild(empty);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'orders-table-wrap';

      const table = document.createElement('table');
      table.className = 'orders-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>UID</th>
            <th>Role</th>
            <th>Active</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
      `;

      const body = document.createElement('tbody');
      visibleUsers.forEach((user) => {
        const row = document.createElement('tr');
        const isSelf = user.uid === actor?.uid;
        const rowLoading = viewState.rowLoadingUid === user.uid;
        const selectedRole = viewState.draftRoles[user.uid] ?? user.role;

        row.innerHTML = `
          <td>${user.name || '-'}</td>
          <td>${user.email || '-'}</td>
          <td><code>${user.uid}</code></td>
          <td></td>
          <td><span class="status-pill ${user.active ? 'status-pill--completed' : 'status-pill--cancelled'}">${user.active ? 'active' : 'inactive'}</span></td>
          <td>${formatTimestamp(user.updatedAt)}</td>
          <td></td>
        `;

        const roleCell = row.children[3];
        if (canManage) {
          const select = document.createElement('select');
          select.className = 'user-role-select';
          select.disabled = rowLoading || isSelf;
          ROLE_OPTIONS.forEach((role) => {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = role;
            option.selected = role === selectedRole;
            select.appendChild(option);
          });
          select.addEventListener('change', (event) => {
            viewState.draftRoles[user.uid] = event.target.value;
          });
          roleCell.appendChild(select);
        } else {
          roleCell.textContent = user.role;
        }

        const actionsCell = row.children[6];
        if (canManage) {
          const actions = document.createElement('div');
          actions.className = 'user-actions';

          const saveRoleButton = document.createElement('button');
          saveRoleButton.type = 'button';
          saveRoleButton.className = 'button button--secondary';
          saveRoleButton.textContent = 'Save Role';
          saveRoleButton.disabled = rowLoading || isSelf || selectedRole === user.role;
          saveRoleButton.addEventListener('click', async () => {
            if (!hasPermission(actor?.role, PERMISSIONS.USERS_MANAGE)) {
              return;
            }

            viewState.rowLoadingUid = user.uid;
            viewState.error = '';
            viewState.message = '';
            renderPage();

            try {
              await userService.updateUserRole({ uid: user.uid, role: selectedRole }, actor);
              viewState.message = `Updated role for ${user.email}.`;
              await loadUsers();
            } catch (error) {
              viewState.error = error.message || 'Failed to update role.';
            } finally {
              viewState.rowLoadingUid = '';
              renderPage();
            }
          });

          const activeButton = document.createElement('button');
          activeButton.type = 'button';
          activeButton.className = 'button button--secondary';
          activeButton.textContent = user.active ? 'Deactivate' : 'Activate';
          activeButton.disabled = rowLoading || isSelf;
          activeButton.addEventListener('click', async () => {
            if (!hasPermission(actor?.role, PERMISSIONS.USERS_MANAGE)) {
              return;
            }

            viewState.rowLoadingUid = user.uid;
            viewState.error = '';
            viewState.message = '';
            renderPage();

            try {
              await userService.updateUserActiveState({ uid: user.uid, active: !user.active }, actor);
              viewState.message = `${!user.active ? 'Activated' : 'Deactivated'} ${user.email}.`;
              await loadUsers();
            } catch (error) {
              viewState.error = error.message || 'Failed to update active state.';
            } finally {
              viewState.rowLoadingUid = '';
              renderPage();
            }
          });

          actions.appendChild(saveRoleButton);
          actions.appendChild(activeButton);
          if (isSelf) {
            const note = document.createElement('small');
            note.className = 'field-helper';
            note.textContent = 'Self role/active changes are disabled for safety.';
            actions.appendChild(note);
          }
          actionsCell.appendChild(actions);
        } else {
          actionsCell.textContent = '-';
        }

        body.appendChild(row);
      });

      table.appendChild(body);
      wrap.appendChild(table);
      listPanel.appendChild(wrap);
    }

    if (viewState.message) {
      const banner = document.createElement('div');
      banner.className = 'import-result-banner is-success';
      banner.textContent = viewState.message;
      listPanel.appendChild(banner);
    } else if (viewState.error && viewState.users.length) {
      const banner = document.createElement('div');
      banner.className = 'import-result-banner is-error';
      banner.textContent = viewState.error;
      listPanel.appendChild(banner);
    }

    listMount.appendChild(listPanel);
  };

  const loadUsers = async () => {
    viewState.loading = true;
    viewState.error = '';
    renderPage();

    try {
      viewState.users = await userService.listUsers(actor);
      viewState.draftRoles = viewState.users.reduce((accumulator, user) => {
        accumulator[user.uid] = user.role;
        return accumulator;
      }, {});
      viewState.error = '';
    } catch (error) {
      viewState.error = error.message || 'Failed to load users.';
      viewState.users = [];
    } finally {
      viewState.loading = false;
      renderPage();
    }
  };

  renderPage();
  void loadUsers();

  return section;
}
