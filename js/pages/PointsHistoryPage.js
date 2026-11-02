import { Page } from './Page.js';
import { h, mount, fmtDate } from '../dom.js';

export class PointsHistoryPage extends Page {
  #rows = [];

  get title() {
    return 'Points History';
  }

  async render(root) {
    await super.render(root);
    const table = this.user.roleLabel === 'Teacher' ? 'point_distributions' : 'point_transactions';
    const filter = this.user.roleLabel === 'Teacher' ? `staff_id=eq.${this.user.id}` : `student_id=eq.${this.user.id}`;
    this.watch(table, filter);
  }

  async load() {
    const isTeacher = this.user.roleLabel === 'Teacher';
    const table = isTeacher ? 'point_distributions' : 'point_transactions';
    const ownerColumn = isTeacher ? 'staff_id' : 'student_id';
    this.#rows = await this.run(
      this.db.from(table).select('*').eq(ownerColumn, this.user.id).order('created_at', { ascending: false }),
    );
  }

  draw() {
    if (!this.#rows.length) {
      mount(this.body, h('p', { class: 'empty' }, 'No transactions yet.'));
      return;
    }
    mount(this.body, h('section', { class: 'panel list' }, this.#rows.map((row) => {
      const positive = row.amount >= 0;
      return h('div', { class: 'list-row' },
        h('div', { class: 'grow' }, h('strong', null, row.reason ?? ''), h('div', { class: 'muted small' }, fmtDate(row.created_at))),
        h('strong', { class: positive ? 'plus' : 'minus' }, `${positive ? '+' : ''}${row.amount}`));
    })));
  }
}
