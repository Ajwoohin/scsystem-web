import { Page } from './Page.js';
import { h, mount } from '../dom.js';
import { formatName } from '../Name.js';

export class DistributePointsPage extends Page {
  #staff = [];
  #selected = new Set();

  get title() {
    return 'Distribute Points';
  }

  build() {
    this.list = h('div', { class: 'stack' });
    this.amount = h('input', { type: 'number', min: 1, placeholder: 'SCpoints per person' });
    this.reason = h('input', { type: 'text', placeholder: 'Reason' });
    this.send = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.#distribute() }, 'Distribute');
    this.body = this.list;
    mount(this.root,
      h('h1', { class: 'page-title' }, this.title),
      h('section', { class: 'panel stack' }, h('h3', null, 'Approved staff'), this.list),
      h('section', { class: 'panel stack' },
        h('div', { class: 'field' }, h('label', null, 'Amount per person'), this.amount),
        h('div', { class: 'field' }, h('label', null, 'Reason'), this.reason),
        this.send));
  }

  async load() {
    this.#staff = await this.run(this.db.from('staff').select('*').eq('status', 'approved').order('full_name'));
  }

  draw() {
    if (!this.#staff.length) {
      mount(this.list, h('p', { class: 'empty' }, 'No approved staff yet.'));
      return;
    }
    mount(this.list, this.#staff.map((s) => {
      const box = h('input', {
        type: 'checkbox', checked: this.#selected.has(s.id),
        onchange: (e) => { e.target.checked ? this.#selected.add(s.id) : this.#selected.delete(s.id); },
      });
      return h('label', { class: 'check list-row' }, box,
        h('span', { class: 'grow' }, h('strong', null, formatName(s)), h('div', { class: 'muted small' }, s.email)),
        h('span', { class: 'badge blue' }, `${s.sc_points ?? 0} SCpoints`));
    }));
  }

  async #distribute() {
    const points = parseInt(this.amount.value, 10);
    const reason = this.reason.value.trim();
    const chosen = this.#staff.filter((s) => this.#selected.has(s.id));
    if (!chosen.length) return this.toast('Select at least one staff member.', 'error');
    if (!(points > 0)) return this.toast('Enter a valid amount.', 'error');
    if (!reason) return this.toast('Please enter a reason.', 'error');

    this.send.disabled = true;
    try {
      for (const s of chosen) {
        const { error } = await this.db.rpc('admin_distribute_points', {
          p_staff_id: s.id, p_staff_name: formatName(s), p_amount: points, p_reason: reason,
        });
        if (error) throw error;
      }
      this.toast(`Distributed ${points} SCpoints to ${chosen.length} staff.`, 'success');
      this.#selected.clear();
      this.amount.value = '';
      this.reason.value = '';
      await this.refresh();
    } catch (error) {
      this.toast(error.message, 'error');
    } finally {
      this.send.disabled = false;
    }
  }
}
