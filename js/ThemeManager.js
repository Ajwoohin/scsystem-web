// Controls light/dark mode. Remembers the choice in the browser.
export class ThemeManager {
  static #STORAGE_KEY = 'scsystem-theme';

  // Private: only this class can change the mode directly (encapsulation).
  #mode;
  #button = null;

  constructor() {
    this.#mode = ThemeManager.#readStartingMode();
    this.#applyToPage();
  }

  // Getter: anyone can READ the mode.
  get mode() {
    return this.#mode;
  }

  // Setter: anyone can CHANGE the mode, but bad values are rejected.
  set mode(value) {
    if (value !== 'light' && value !== 'dark') return;
    this.#mode = value;
    this.#applyToPage();
    this.#remember();
    this.#updateButton();
  }

  toggle() {
    this.mode = this.#mode === 'dark' ? 'light' : 'dark';
  }

  // Connects the round sun/moon button to this object.
  attachTo(button) {
    this.#button = button;
    this.#updateButton();
    button.addEventListener('click', () => this.toggle());
  }

  static #readStartingMode() {
    try {
      const saved = localStorage.getItem(ThemeManager.#STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (_) {
      // Storage can be blocked. Fall through to the computer's setting.
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  #applyToPage() {
    document.documentElement.setAttribute('data-theme', this.#mode);
  }

  #remember() {
    try {
      localStorage.setItem(ThemeManager.#STORAGE_KEY, this.#mode);
    } catch (_) {
      // Not saving is fine. The page still works.
    }
  }

  #updateButton() {
    if (!this.#button) return;
    const goingTo = this.#mode === 'dark' ? 'light' : 'dark';
    this.#button.setAttribute('aria-label', `Switch to ${goingTo} mode`);
    this.#button.setAttribute('title', `Switch to ${goingTo} mode`);
  }
}
