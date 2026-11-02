import { Page } from './Page.js';
import { h, mount, fmtDate } from '../dom.js';
import { formatName } from '../Name.js';

export class StaffRequestsPage extends Page {
  #rows = [];

  get title() {
    return 'Teacher Requests';
  }

  async render(root) {
    await super.render(root);
    this.watch('staff');
  }

  async load() {
    this.#rows = await this.run(this.db.from('staff').select('*').eq('status', 'pending').order('created_at', { ascending: true }));
  }

  draw() {
    if (!this.#rows.length) {
      mount(this.body, h('p', { class: 'empty' }, 'No pending requests.'));
      return;
    }
    mount(this.body, this.#rows.map((row) => h('div', { class: 'panel page-head' },
      h('div', null, h('strong', null, formatName(row)), h('div', { class: 'muted small' }, `${row.email} • ${fmtDate(row.created_at)}`)),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => this.#respond(row, 'declined') }, 'Decline'),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => this.#respond(row, 'approved') }, 'Accept')))));
  }

  async #respond(row, status) {
    try {
      await this.run(this.db.from('staff').update({ status }).eq('id', row.id));
      this.toast(`${formatName(row)} ${status}.`, 'success');
      await this.refresh();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }
}
