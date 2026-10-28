import { ThemeManager } from './ThemeManager.js';
import { SupabaseService } from './SupabaseService.js';
import { AuthService } from './AuthService.js';
import { PasswordToggle } from './PasswordToggle.js';

const theme = new ThemeManager();
theme.attachTo(document.getElementById('themeToggle'));
new PasswordToggle(document.getElementById('password'), document.getElementById('togglePassword'));

const auth = new AuthService(new SupabaseService());
const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const button = document.getElementById('submitBtn');
const message = document.getElementById('formMessage');
const isAdminPage = location.pathname.endsWith('admin-login.html');

const params = new URLSearchParams(location.search);
if (params.has('error')) {
  message.textContent = params.get('error');
  message.hidden = false;
} else if (params.has('message')) {
  message.textContent = params.get('message') === 'pending'
    ? 'Your staff request is waiting for administrator approval.'
    : 'Your staff request was declined. Please contact the administrator.';
  message.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  form.querySelectorAll('.error').forEach((slot) => { slot.textContent = ''; });
  form.querySelectorAll('.field').forEach((field) => field.classList.remove('has-error'));
  message.hidden = true;

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (!email || !password) {
    message.textContent = 'Please enter your email and password.';
    message.hidden = false;
    return;
  }
  if (isAdminPage && email !== AuthService.ADMIN_EMAIL.toLowerCase()) {
    message.textContent = 'Use the administrator email for this page.';
    message.hidden = false;
    return;
  }

  button.disabled = true;
  button.textContent = 'Signing in...';
  try {
    const user = await auth.signIn(email, password);
    const account = await auth.getAccount(user);

    if (isAdminPage && account.role !== 'admin') {
      await auth.signOut();
      throw new Error('This account does not have administrator access.');
    }
    if (account.role === 'staff' && account.status !== 'approved') {
      await auth.signOut();
      if (account.status === 'declined') throw new Error('Your staff request was declined. Please contact the administrator.');
      throw new Error('Your staff account is waiting for administrator approval.');
    }

    location.href = 'dashboard.html';
  } catch (error) {
    message.textContent = error.message || 'Login failed. Please try again.';
    message.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = isAdminPage ? 'Log In as Administrator' : 'Log In';
  }
});
