import { Page } from './Page.js';
import { h, mount } from '../dom.js';
import { formatName } from '../Name.js';

export class SendPointsPage extends Page {
  #target = null;

  get title() {
    return this.user.sendLabel;
  }

  build() {
    this.edp = h('input', { type: 'text', inputMode: 'numeric', placeholder: 'Student EDP number' });
    this.edp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.#find(); });
    this.balance = h('p', { class: 'muted' });
    this.result = h('div', { class: 'stack' });
    this.body = this.result;
    mount(this.root,
      h('h1', { class: 'page-title' }, this.title),
      h('section', { class: 'panel stack' },
        this.balance,
        h('div', { class: 'field' }, h('label', null, 'Find a student by EDP number'),
          h('div', { class: 'row' }, this.edp, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => this.#find() }, 'Find'))),
        this.result));
  }

  async load() {
    await this.user.refreshPoints(this.db);
  }

  draw() {
    this.balance.textContent = this.user.isAdmin
      ? 'You can award any amount.'
      : `Your balance: ${this.user.scPoints} SCpoints`;
  }

  async #find() {
    const edp = this.edp.value.trim();
    if (!edp) return;
    try {
      const rows = await this.run(this.db.rpc('lookup_student_by_edp', { p_edp: edp }));
      const data = Array.isArray(rows) ? rows[0] : rows;
      if (!data) { this.#target = null; mount(this.result, h('p', { class: 'error-text' }, 'No student found with that EDP number.')); return; }
      if (data.id === this.user.id) { this.#target = null; mount(this.result, h('p', { class: 'error-text' }, 'You cannot send points to yourself.')); return; }
      this.#target = data;
      this.#drawForm();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }

  #drawForm() {
    const amount = h('input', { type: 'number', min: 1, placeholder: 'Amount' });
    const reason = h('input', { type: 'text', placeholder: 'Message (optional)' });
    const send = h('button', { class: 'btn btn-primary', type: 'button' }, this.user.sendLabel);
    send.addEventListener('click', async () => {
      const points = parseInt(amount.value, 10);
      if (!(points > 0)) return this.toast('Enter a valid amount.', 'error');
      if (points > this.user.maxSendable) return this.toast('You do not have enough SCpoints.', 'error');
      send.disabled = true;
      try {
        const note = reason.value.trim();
        const text = this.user.isAdmin ? (note || 'Points awarded by Administration') : `${note ? `${note} - ` : ''}from ${this.user.fullName}`;
        await this.user.sendPoints(this.db, this.#target.id, points, text);
        this.toast(`Sent ${points} SCpoints to ${formatName(this.#target)}.`, 'success');
        this.#target = null;
        this.edp.value = '';
        mount(this.result);
        await this.refresh();
      } catch (error) {
        this.toast(error.message, 'error');
      } finally {
        send.disabled = false;
      }
    });
    mount(this.result,
      h('div', { class: 'info-row' }, h('strong', null, formatName(this.#target)), h('span', { class: 'muted' }, `EDP: ${this.#target.edp_number}`)),
      h('div', { class: 'field' }, h('label', null, 'Amount'), amount),
      h('div', { class: 'field' }, h('label', null, 'Message'), reason),
      send);
  }
}
