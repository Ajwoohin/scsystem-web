import { Modal } from './Modal.js';

// The Terms and Conditions pop-up.
// The "I Agree" button stays locked until the person scrolls to the bottom.
export class TermsModal extends Modal {
  #body;
  #agreeButton;
  #hint;
  #onAgree;
  #unlockedBefore = false;

  constructor(dialogId, onAgree) {
    super(dialogId);
    this.#body = this.element.querySelector('.modal-body');
    this.#agreeButton = this.element.querySelector('[data-agree]');
    this.#hint = this.element.querySelector('.scroll-hint');
    this.#onAgree = onAgree;

    this.#body.addEventListener('scroll', () => this.#checkScrollPosition());

    this.#agreeButton.addEventListener('click', () => {
      this.#unlockedBefore = true;
      this.#onAgree();
      this.close();
    });
  }

  // Overrides Modal.onOpen(): lock the button and go back to the top.
  onOpen() {
    this.#body.scrollTop = 0;
    this.#agreeButton.disabled = !this.#unlockedBefore;
    this.#hint.hidden = this.#unlockedBefore;
    // Wait one frame so the browser has measured the text first.
    requestAnimationFrame(() => this.#checkScrollPosition());
  }

  #checkScrollPosition() {
    const box = this.#body;
    const reachedBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
    if (reachedBottom) {
      this.#agreeButton.disabled = false;
      this.#hint.hidden = true;
    }
  }
}
