function validateLoginForm({ email, password }) {
  if (!email) {
    return 'Vui long nhap email.';
  }

  if (!password) {
    return 'Vui long nhap mat khau.';
  }

  return '';
}

export function renderLoginPage({ state, onLogin }) {
  const section = document.createElement('section');
  section.className = 'page page--centered';

  const card = document.createElement('div');
  card.className = 'auth-card';

  const firebaseReady = state.firebaseReady;

  card.innerHTML = `
    <span class="eyebrow">Secure Access</span>
    <h2>Dang nhap vao he thong</h2>
    <p class="page-copy">
      Chi tai khoan da duoc cap quyen moi co the truy cap khong gian quan ly don hang noi bo.
    </p>
  `;

  const form = document.createElement('form');
  form.className = 'form-grid';
  form.autocomplete = 'off';

  const emailField = document.createElement('label');
  emailField.className = 'field';
  emailField.innerHTML = `
    <span>Email</span>
    <input type="email" name="email" placeholder="name@company.com" ${firebaseReady ? '' : 'disabled'} />
  `;

  const passwordField = document.createElement('label');
  passwordField.className = 'field';
  passwordField.innerHTML = `
    <span>Password</span>
    <input type="password" name="password" placeholder="••••••••" ${firebaseReady ? '' : 'disabled'} />
  `;

  const submitButton = document.createElement('button');
  submitButton.className = 'button button--primary';
  submitButton.type = 'submit';
  submitButton.disabled = !firebaseReady || state.authLoading;
  submitButton.textContent = state.authLoading ? 'Signing in...' : 'Sign In';

  const helper = document.createElement('p');
  helper.className = 'form-helper';
  helper.textContent = firebaseReady
    ? 'Dung email/password da duoc tao trong Firebase Authentication.'
    : 'Dien Firebase env truoc khi dung chuc nang dang nhap.';

  const feedback = document.createElement('div');
  feedback.className = 'form-feedback';

  if (state.authError) {
    feedback.classList.add('is-error');
    feedback.textContent = state.authError;
  } else {
    feedback.textContent = ' ';
  }

  form.appendChild(emailField);
  form.appendChild(passwordField);
  form.appendChild(submitButton);
  form.appendChild(helper);
  form.appendChild(feedback);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      email: String(formData.get('email') ?? '').trim(),
      password: String(formData.get('password') ?? '')
    };

    const validationMessage = validateLoginForm(payload);

    if (validationMessage) {
      feedback.classList.add('is-error');
      feedback.textContent = validationMessage;
      return;
    }

    await onLogin?.(payload);
  });

  card.appendChild(form);
  section.appendChild(card);

  return section;
}
