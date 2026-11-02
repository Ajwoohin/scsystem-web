import { h } from './dom.js';

export class Toast {
  static show(message, type = 'info') {
    const host = document.getElementById('toasts') ?? document.body;
    const el = h('div', { class: `toast ${type}`, role: 'status' }, message);
    host.append(el);
    setTimeout(() => el.remove(), 3800);
  }
}
