import { Page } from './Page.js';
import { h, mount, fmtDate } from '../dom.js';

export class DistributionHistoryPage extends Page {
  #rows = [];

  get title() {
    return 'Distribution History';
  }

  async render(root) {
    await super.render(root);
    this.watch('point_distributions');
  }

  async load() {
    this.#rows = await this.run(this.db.from('point_distributions').select('*').order('created_at', { ascending: false }));
  }

  draw() {
    if (!this.#rows.length) {
      mount(this.body, h('p', { class: 'empty' }, 'No distributions yet.'));
      return;
    }
    mount(this.body, h('section', { class: 'panel list' }, this.#rows.map((row) =>
      h('div', { class: 'list-row' },
        h('div', { class: 'grow' }, h('strong', null, row.staff_name), h('div', { class: 'muted small' }, `${row.reason ?? ''} • ${fmtDate(row.created_at)}`)),
        h('strong', { class: 'plus' }, `+${row.amount}`)))));
  }
}
