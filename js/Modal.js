// Parent class for every pop-up. Child classes can override onOpen() and onClose().
export class Modal {
  #dialog;

  constructor(dialogId) {
    this.#dialog = document.getElementById(dialogId);
    if (!this.#dialog) {
      throw new Error(`Pop-up "${dialogId}" was not found in the page.`);
    }

    // Any button marked data-close shuts the pop-up.
    this.#dialog.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => this.close());
    });

    // Clicking the dark area outside the box also closes it.
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog) this.close();
    });

    this.#dialog.addEventListener('close', () => this.onClose());
  }

  get element() {
    return this.#dialog;
  }

  get isOpen() {
    return this.#dialog.open;
  }

  open() {
    this.#dialog.showModal();
    this.onOpen();
  }

  close() {
    if (this.#dialog.open) this.#dialog.close();
  }

  // Hooks: children replace these (method overriding).
  onOpen() {}
  onClose() {}
}
