import { Page } from './Page.js';
import { Bus, BusStatus } from '../models.js';
import { h, mount, fmtDate } from '../dom.js';

const ZONES = [['main', 'Main'], ['buena', 'Buena'], ['break', 'On Break']];

export class BusPage extends Page {
  #zone = 'main';
  buses = [];

  get title() {
    return 'Buses';
  }

  async render(root) {
    await super.render(root);
    this.watch('buses');
  }

  async load() {
    const rows = await this.run(this.db.from('buses').select('*').order('name'));
    this.buses = rows.map((row) => new Bus(row));
  }

  draw() {
    const tabs = h('div', { class: 'tabs' }, ZONES.map(([id, label]) =>
      h('button', { class: `tab${this.#zone === id ? ' active' : ''}`, type: 'button', onclick: () => { this.#zone = id; this.draw(); } }, label)));
    const visible = this.buses.filter((bus) => bus.zone === this.#zone);
    const list = visible.length
      ? visible.map((bus) => this.card(bus))
      : h('p', { class: 'empty' }, 'No buses here right now.');
    mount(this.body, h('div', { class: 'banner' }, '🚌  BUSES'), tabs, h('div', { class: 'stack' }, list));
  }

  card(bus) {
    return h('div', { class: `panel bus tone-${bus.tone}` },
      h('div', { class: 'bus-icon' }, '🚌'),
      h('div', { class: 'grow' },
        h('strong', null, bus.name),
        h('div', { class: `status-text tone-${bus.tone}` }, `Status: ${bus.label}`)),
      bus.isMoving ? h('span', { class: `moving tone-${bus.tone}` }, '➜') : null);
  }
}

export class BusControlPage extends BusPage {
  get title() {
    return 'Bus Control';
  }

  draw() {
    mount(this.body, h('div', { class: 'grid' }, this.buses.map((bus) => this.card(bus))));
  }

  card(bus) {
    const buttons = BusStatus.all.map((status) =>
      h('button', {
        class: `status-btn tone-${BusStatus.tone(status)}${bus.status === status ? ' active' : ''}`,
        type: 'button',
        onclick: () => this.setStatus(bus, status),
      }, BusStatus.label(status)));
    return h('div', { class: `panel tone-${bus.tone}` },
      h('div', { class: 'bus' }, h('div', { class: 'bus-icon' }, '🚌'),
        h('div', { class: 'grow' }, h('strong', null, bus.name), h('div', { class: `status-text tone-${bus.tone}` }, bus.label))),
      h('div', { class: 'status-grid' }, buttons));
  }

  async setStatus(bus, status) {
    try {
      bus.status = status;
      await this.run(this.db.from('buses').update({ status: bus.status }).eq('id', bus.id));
      await this.refresh();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }
}
