import { Page } from './Page.js';
import { Quest, recomputeQuestCompletion } from '../models.js';
import { h, mount, fmtDuration } from '../dom.js';
import { formatName } from '../Name.js';

export class QuestActivityPage extends Page {
  #quests = [];
  #rows = [];
  #students = new Map();
  #timer = null;

  get title() {
    return 'Quest Activity';
  }

  async render(root) {
    await super.render(root);
    this.watch('quest_acceptances');
    this.#timer = setInterval(() => this.#tick(), 1000);
  }

  async load() {
    const quests = await this.run(this.db.from('quests').select('*').eq('posted_by_id', this.user.id).order('created_at', { ascending: false }));
    this.#quests = quests.map((q) => new Quest(q));
    const ids = this.#quests.map((q) => q.id);
    this.#rows = ids.length ? await this.run(this.db.from('quest_acceptances').select('*').in('quest_id', ids)) : [];
    const studentIds = [...new Set(this.#rows.map((r) => r.student_id))];
    const students = studentIds.length
      ? await this.run(this.db.from('students').select('id, full_name, first_name, middle_name, last_name, edp_number').in('id', studentIds))
      : [];
    this.#students = new Map(students.map((s) => [s.id, s]));
  }

  draw() {
    if (!this.#quests.length) {
      mount(this.body, h('p', { class: 'empty' }, "You haven't created any quests yet."));
      return;
    }
    mount(this.body, this.#quests.map((q) => this.#questPanel(q)));
    this.#tick();
  }

  #questPanel(quest) {
    const people = this.#rows.filter((r) => r.quest_id === quest.id);
    return h('section', { class: 'panel' },
      h('div', { class: 'page-head' }, h('h3', null, quest.title),
        h('span', { class: `badge ${quest.isCompleted ? 'green' : 'blue'}` }, quest.isCompleted ? 'Completed' : 'In Progress')),
      h('div', { class: 'muted small' }, `${people.length}/${quest.limit} accepted • ${quest.reward} SCpoints • ${quest.timeLimit}`),
      h('h4', null, 'Participants'),
      people.length ? h('div', { class: 'stack' }, people.map((r) => this.#person(r, quest))) : h('p', { class: 'muted' }, 'No students have accepted this quest yet.'),
      quest.isCompleted
        ? h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => this.#archive(quest, people) }, 'Archive & delete quest')
        : null);
  }

  #person(row, quest) {
    const student = this.#students.get(row.student_id);
    let status;
    if (row.status === 'in_progress') {
      status = h('span', { class: 'badge blue' }, h('span', { 'data-since': row.accepted_at }, '00:00'));
    } else if (row.status === 'pending_review') {
      const took = row.submitted_at ? fmtDuration(new Date(row.submitted_at) - new Date(row.accepted_at)) : '';
      status = h('span', { class: 'badge amber' }, `Finished ${took}`);
    } else if (row.status === 'approved') {
      status = h('span', { class: 'badge green' }, 'Approved');
    } else if (row.status === 'rejected') {
      status = h('span', { class: 'badge red' }, 'Rejected');
    } else {
      status = h('span', { class: 'badge gray' }, 'Cancelled');
    }

    const review = row.status === 'pending_review'
      ? h('div', { class: 'row' },
        h('a', { class: 'btn btn-secondary btn-sm', href: row.photo_url, target: '_blank', rel: 'noopener' }, 'View photo'),
        h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => this.#reject(row, quest) }, 'Reject'),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => this.#approve(row, quest) }, 'Accept'))
      : null;

    return h('div', { class: 'participant' },
      h('div', { class: 'page-head' },
        h('div', null, h('strong', null, student ? formatName(student) : 'Loading...'), student?.edp_number ? h('div', { class: 'muted small' }, `EDP: ${student.edp_number}`) : null),
        status),
      review);
  }

  #tick() {
    this.root.querySelectorAll('[data-since]').forEach((el) => {
      el.textContent = fmtDuration(Date.now() - new Date(el.getAttribute('data-since')).getTime());
    });
  }

  async #approve(row, quest) {
    try {
      await this.user.sendPoints(this.db, row.student_id, quest.reward, `Quest completed: ${quest.title}`);
      await this.run(this.db.from('quest_acceptances').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', row.id));
      await recomputeQuestCompletion(this.db, quest);
      await this.user.refreshPoints(this.db);
      this.toast('Approved. Points were sent.', 'success');
      await this.refresh();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }

  async #reject(row, quest) {
    try {
      await this.run(this.db.from('quest_acceptances').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', row.id));
      await recomputeQuestCompletion(this.db, quest);
      await this.refresh();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }

  async #archive(quest, people) {
    if (!this.ask('Archive and delete this quest? Names, EDPs and points are saved to the Quest History Log. Live records and photos are removed.')) return;
    try {
      for (const row of people) {
        const student = this.#students.get(row.student_id);
        await this.run(this.db.from('quest_history_log').insert({
          quest_title: quest.title,
          student_name: student ? formatName(student) : 'Unknown',
          student_edp: student?.edp_number ?? '',
          status: row.status,
          points_awarded: row.status === 'approved' ? quest.reward : 0,
          posted_by_id: quest.postedById,
        }));
        if (row.photo_path) await this.db.storage.from('quest-proofs').remove([row.photo_path]);
      }
      await this.run(this.db.from('quest_acceptances').delete().eq('quest_id', quest.id));
      await this.run(this.db.from('quests').delete().eq('id', quest.id));
      this.toast('Quest archived and removed.', 'success');
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
