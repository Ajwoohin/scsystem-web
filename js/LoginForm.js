import { PasswordToggle } from './PasswordToggle.js';

export class LoginForm {
  #email;
  #password;
  #button;
  #label;
  #message;

  constructor(form, auth) {
    this.auth = auth;
    this.#email = form.querySelector('#email');
    this.#password = form.querySelector('#password');
    this.#button = form.querySelector('#submitBtn');
    this.#label = this.#button.textContent;
    this.#message = form.querySelector('#formMessage');
    new PasswordToggle(this.#password, document.getElementById('togglePassword'));
    form.addEventListener('submit', (event) => this.#onSubmit(event));
  }

  authenticate(email, password) {
    return this.auth.signIn(email, password);
  }

  async #onSubmit(event) {
    event.preventDefault();
    const email = this.#email.value.trim().toLowerCase();
    const password = this.#password.value;
    if (!email || !password) {
      this.#show('Please enter your email and password.');
      return;
    }

    this.#button.disabled = true;
    this.#button.textContent = 'Logging in...';
    const result = await this.authenticate(email, password);
    this.#button.disabled = false;
    this.#button.textContent = this.#label;

    if (!result.ok) {
      this.#show(result.message);
      return;
    }
    location.href = 'app.html';
  }

  #show(text) {
    this.#message.textContent = text;
    this.#message.hidden = false;
  }
}

export class AdminLoginForm extends LoginForm {
  authenticate(email, password) {
    return this.auth.signInAdmin(email, password);
  }
}
