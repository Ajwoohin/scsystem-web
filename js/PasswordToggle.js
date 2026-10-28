// The little eye button that shows or hides a password.
export class PasswordToggle {
  #input;
  #button;
  #visible = false;

  constructor(input, button) {
    this.#input = input;
    this.#button = button;
    this.#render();
    button.addEventListener('click', () => this.toggle());
  }

  get visible() {
    return this.#visible;
  }

  set visible(value) {
    this.#visible = Boolean(value);
    this.#render();
  }

  toggle() {
    this.visible = !this.#visible;
  }

  #render() {
    this.#input.type = this.#visible ? 'text' : 'password';
    this.#button.dataset.visible = String(this.#visible);
    this.#button.setAttribute('aria-pressed', String(this.#visible));
    this.#button.setAttribute('aria-label', this.#visible ? 'Hide password' : 'Show password');
  }
}
