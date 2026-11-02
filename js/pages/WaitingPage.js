import { Page } from './Page.js';
import { h, mount } from '../dom.js';

export class WaitingPage extends Page {
  build() {
    const declined = this.user.status === 'declined';
    mount(this.root, h('section', { class: 'panel center' },
      h('h1', { class: 'page-title' }, declined ? 'Request Declined' : 'Waiting for Approval'),
      h('p', { class: 'muted' }, declined
        ? 'An administrator declined your staff request. Please contact the administration.'
        : 'Your staff account is waiting for an administrator to approve it. This page will work once you are approved.'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload() }, 'Check again'),
    ));
  }

  async refresh() {}
}
