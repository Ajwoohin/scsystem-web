import { Page } from './Page.js';
import { Quest } from '../models.js';
import { h, mount } from '../dom.js';

export class ManageQuestsPage extends Page {
  #quests = [];

  get title() {
    return 'Manage Quests';
  }

  build() {
    this.body = h('div', { class: 'stack' });
    const form = this.#buildForm();
    const add = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { form.hidden = !form.hidden; } }, '+ New quest');
    mount(this.root, h('div', { class: 'page-head' }, h('h1', { class: 'page-title' }, this.title), add), form, this.body);
  }

  async render(root) {
    await super.render(root);
    this.watch('quests');
    this.watch('quest_acceptances');
  }

  async load() {
    const rows = await this.run(this.db.from('quests').select('*').order('created_at', { ascending: false }));
    this.#quests = rows.map((q) => new Quest(q));
  }

  draw() {
    if (!this.#quests.length) {
      mount(this.body, h('p', { class: 'empty' }, 'No quests yet. Create the first one.'));
      return;
    }
    mount(this.body, this.#quests.map((q) => h('div', { class: 'panel' },
      h('div', { class: 'page-head' }, h('h3', null, q.title),
        h('span', { class: `badge ${q.isCompleted ? 'green' : 'blue'}` }, q.isCompleted ? 'Completed' : 'Open')),
      h('p', { class: 'muted' }, q.description),
      h('div', { class: 'muted small' }, `${q.reward} SCpoints • Up to ${q.limit} students • ${q.timeLimit} • Posted by ${q.postedBy}`))));
  }

  #buildForm() {
    const title = h('input', { type: 'text', placeholder: 'Quest title' });
    const description = h('textarea', { rows: 3, placeholder: 'What should students do?' });
    const reward = h('input', { type: 'number', min: 1, placeholder: 'SCpoints reward' });
    const limit = h('input', { type: 'number', min: 1, placeholder: 'How many students can accept' });
    const amount = h('input', { type: 'number', min: 1, placeholder: 'Time limit' });
    const unit = h('select', null, ['Minutes', 'Hours', 'Days'].map((u) => h('option', { value: u }, u)));
    const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Create quest');

    save.addEventListener('click', async () => {
      const points = parseInt(reward.value, 10);
      const slots = parseInt(limit.value, 10);
      const time = parseInt(amount.value, 10);
      if (!title.value.trim() || !description.value.trim() || !(points > 0) || !(slots > 0) || !(time > 0)) {
        this.toast('Please fill in every field with valid numbers.', 'error');
        return;
      }
      save.disabled = true;
      try {
        await this.run(this.db.from('quests').insert({
          title: title.value.trim(),
          description: description.value.trim(),
          reward: points,
          acceptance_limit: slots,
          time_limit: `${time} ${time === 1 ? unit.value.slice(0, -1) : unit.value}`,
          posted_by: this.user.postedByName,
          posted_by_id: this.user.id,
        }));
        [title, description, reward, limit, amount].forEach((el) => { el.value = ''; });
        form.hidden = true;
        this.toast('Quest created.', 'success');
        await this.refresh();
      } catch (error) {
        this.toast(error.message, 'error');
      } finally {
        save.disabled = false;
      }
    });

    const form = h('section', { class: 'panel stack', hidden: true },
      h('h3', null, 'New quest'),
      h('div', { class: 'field' }, h('label', null, 'Title'), title),
      h('div', { class: 'field' }, h('label', null, 'Description'), description),
      h('div', { class: 'row' },
        h('div', { class: 'field grow' }, h('label', null, 'Reward (SCpoints)'), reward),
        h('div', { class: 'field grow' }, h('label', null, 'Acceptance limit'), limit)),
      h('div', { class: 'field' }, h('label', null, 'Time limit'), h('div', { class: 'row' }, amount, unit)),
      save);
    return form;
  }
}
