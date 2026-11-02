import { Live } from '../Live.js';
import { Toast } from '../Toast.js';
import { h, mount } from '../dom.js';

export class Page {
  #live;

  constructor(app) {
    this.app = app;
    this.db = app.db;
    this.user = app.user;
    this.#live = new Live(app.db);
  }

  get title() {
    return '';
  }

  async render(root) {
    this.root = root;
    this.build();
    await this.refresh();
  }

  build() {
    this.body = h('div', { class: 'stack' });
    mount(this.root, h('h1', { class: 'page-title' }, this.title), this.body);
  }

  async refresh() {
    try {
      await this.load();
      this.draw();
    } catch (error) {
      mount(this.body ?? this.root, h('p', { class: 'error-text' }, error.message ?? 'Something went wrong.'));
    }
  }

  async load() {}

  draw() {}

  watch(table, filter) {
    this.#live.watch(table, () => this.refresh(), filter);
  }

  async run(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  toast(message, type = 'info') {
    Toast.show(message, type);
  }

  ask(message) {
    return window.confirm(message);
  }

  destroy() {
    this.#live.stop();
  }
}
