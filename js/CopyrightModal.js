import { Modal } from './Modal.js';

// The copyright pop-up. It only needs one extra behavior.
export class CopyrightModal extends Modal {
  // Overrides Modal.onOpen(): always start reading from the top.
  onOpen() {
    this.element.querySelector('.modal-body').scrollTop = 0;
  }
}
