import { Page } from './Page.js';
import { Quest, recomputeQuestCompletion } from '../models.js';
import { h, mount, fmtDate, fmtDuration } from '../dom.js';

const TABS = [['available', 'Available'], ['progress', 'In Progress'], ['history', 'History']];
const BADGES = {
  approved: ['green', 'Approved'],
  rejected: ['red', 'Rejected'],
  cancelled: ['gray', 'Cancelled'],
  pending_review: ['amber', 'Waiting for review'],
};

export class QuestsPage extends Page {
  #tab = 'available';
  #photos = new Map();
  #timer = null;
  #quests = [];
  #mine = [];
  #counts = new Map();

  get title() {
    return 'Quests';
  }

  async render(root) {
    await super.render(root);
    this.watch('quest_acceptances');
    this.watch('quests');
    this.#timer = setInterval(() => this.#tick(), 1000);
  }

  async load() {
    await this.user.refreshPoints(this.db);
    const quests = await this.run(this.db.from('quests').select('*').order('created_at', { ascending: false }));
    const rows = await this.run(this.db.from('quest_acceptances').select('*'));
    this.#quests = quests.map((q) => new Quest(q));
    this.#counts = new Map();
    rows.filter((r) => r.status !== 'cancelled').forEach((r) => this.#counts.set(r.quest_id, (this.#counts.get(r.quest_id) ?? 0) + 1));
    this.#mine = rows.filter((r) => r.student_id === this.user.id);
  }

  draw() {
    const questOf = (row) => this.#quests.find((q) => q.id === row.quest_id);
    const taken = new Set(this.#mine.map((r) => r.quest_id));
    let cards = [];

    if (this.#tab === 'available') {
      cards = this.#quests
        .filter((q) => !q.isCompleted && !taken.has(q.id) && (this.#counts.get(q.id) ?? 0) < q.limit)
        .map((q) => this.#availableCard(q));
    } else if (this.#tab === 'progress') {
      cards = this.#mine
        .filter((r) => r.status === 'in_progress' || r.status === 'pending_review')
        .filter((r) => questOf(r))
        .map((r) => this.#progressCard(questOf(r), r));
    } else {
      cards = this.#mine
        .filter((r) => ['approved', 'rejected', 'cancelled'].includes(r.status))
        .filter((r) => questOf(r))
        .sort((a, b) => new Date(b.reviewed_at ?? 0) - new Date(a.reviewed_at ?? 0))
        .map((r) => this.#historyCard(questOf(r), r));
      if (cards.length) {
        cards.unshift(h('div', { class: 'row' }, h('span', { class: 'grow' }),
          h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => this.#clearHistory() }, 'Clear history')));
      }
    }

    const tabs = h('div', { class: 'tabs' }, TABS.map(([id, label]) =>
      h('button', { class: `tab${this.#tab === id ? ' active' : ''}`, type: 'button', onclick: () => { this.#tab = id; this.draw(); } }, label)));
    mount(this.body,
      h('p', { class: 'muted' }, `Your SCpoints: ${this.user.scPoints}`),
      tabs,
      cards.length ? cards : h('p', { class: 'empty' }, 'Nothing here yet.'));
    this.#tick();
  }

  #info(quest) {
    return h('div', null,
      h('p', { class: 'muted' }, quest.description),
      h('div', { class: 'muted small' }, `Posted by ${quest.postedBy} • Time limit: ${quest.timeLimit}`),
      h('span', { class: 'badge blue' }, `${quest.reward} SCpoints`));
  }

  #availableCard(quest) {
    const left = quest.limit - (this.#counts.get(quest.id) ?? 0);
    return h('div', { class: 'panel' },
      h('div', { class: 'page-head' }, h('h3', null, quest.title), h('span', { class: 'muted small' }, `${left} slot${left === 1 ? '' : 's'} left`)),
      this.#info(quest),
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => this.#accept(quest) }, 'Accept quest'));
  }

  #progressCard(quest, row) {
    const waiting = row.status === 'pending_review';
    let actions;
    if (waiting) {
      actions = h('span', { class: 'badge amber' }, 'Waiting for review');
    } else {
      const file = this.#photos.get(quest.id);
      const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => { this.#photos.set(quest.id, e.target.files[0]); this.draw(); } });
      actions = h('div', { class: 'row' },
        h('span', { class: 'badge blue' }, 'Time: ', h('span', { 'data-since': row.accepted_at }, '00:00')),
        input,
        h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => input.click() }, file ? `Photo: ${file.name}` : 'Take / choose proof photo'),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', disabled: !file, onclick: () => this.#submit(quest, row) }, 'Submit proof'),
        h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => this.#cancel(quest, row) }, 'Cancel'));
    }
    return h('div', { class: 'panel' }, h('h3', null, quest.title), this.#info(quest), actions);
  }

  #historyCard(quest, row) {
    const [tone, label] = BADGES[row.status];
    return h('div', { class: 'panel' },
      h('div', { class: 'page-head' }, h('h3', null, quest.title), h('span', { class: `badge ${tone}` }, label)),
      h('div', { class: 'muted small' }, `${row.status === 'approved' ? `+${quest.reward} SCpoints • ` : ''}${fmtDate(row.reviewed_at)}`));
  }

  #tick() {
    this.root.querySelectorAll('[data-since]').forEach((el) => {
      el.textContent = fmtDuration(Date.now() - new Date(el.getAttribute('data-since')).getTime());
    });
  }

  async #accept(quest) {
    try {
      await this.run(this.db.from('quest_acceptances').insert({
        quest_id: quest.id, student_id: this.user.id, status: 'in_progress', accepted_at: new Date().toISOString(),
      }));
      await recomputeQuestCompletion(this.db, quest);
      this.#tab = 'progress';
      this.toast('Quest accepted. The timer started.', 'success');
      await this.refresh();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }

  async #submit(quest, row) {
    const file = this.#photos.get(quest.id);
    if (!file) return;
    try {
      const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `proof_${quest.id}_${Date.now()}.${extension}`;
      const upload = await this.db.storage.from('quest-proofs').upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (upload.error) throw upload.error;
      const url = this.db.storage.from('quest-proofs').getPublicUrl(path).data.publicUrl;
      await this.run(this.db.from('quest_acceptances').update({
        photo_url: url, photo_path: path, status: 'pending_review', submitted_at: new Date().toISOString(),
      }).eq('id', row.id));
      this.#photos.delete(quest.id);
      this.toast('Submitted. Waiting for approval.', 'success');
      await this.refresh();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }

  async #cancel(quest, row) {
    if (!this.ask('Cancel this quest?')) return;
    try {
      await this.run(this.db.from('quest_acceptances').update({ status: 'cancelled', reviewed_at: new Date().toISOString() }).eq('id', row.id));
      await recomputeQuestCompletion(this.db, quest);
      await this.refresh();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }

  async #clearHistory() {
    if (!this.ask('Clear your quest history?')) return;
    try {
      const done = this.#mine.filter((r) => ['approved', 'rejected', 'cancelled'].includes(r.status));
      const paths = done.map((r) => r.photo_path).filter(Boolean);
      if (paths.length) await this.db.storage.from('quest-proofs').remove(paths);
      await this.run(this.db.from('quest_acceptances').delete().in('id', done.map((r) => r.id)));
      await this.refresh();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }

  destroy() {
    clearInterval(this.#timer);
    super.destroy();
  }
}
