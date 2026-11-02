import { ThemeManager } from './ThemeManager.js';
import { h, mount } from './dom.js';
import { HomePage } from './pages/HomePage.js';
import { AnnouncementsPage } from './pages/AnnouncementsPage.js';
import { BusPage, BusControlPage } from './pages/BusPage.js';
import { QuestsPage } from './pages/QuestsPage.js';
import { ManageQuestsPage } from './pages/ManageQuestsPage.js';
import { QuestActivityPage } from './pages/QuestActivityPage.js';
import { PointsHistoryPage } from './pages/PointsHistoryPage.js';
import { SendPointsPage } from './pages/SendPointsPage.js';
import { StaffRequestsPage } from './pages/StaffRequestsPage.js';
import { DistributePointsPage } from './pages/DistributePointsPage.js';
import { DistributionHistoryPage } from './pages/DistributionHistoryPage.js';
import { WaitingPage } from './pages/WaitingPage.js';

const PAGES = {
  home: HomePage,
  announcements: AnnouncementsPage,
  buses: BusPage,
  buscontrol: BusControlPage,
  quests: QuestsPage,
  manage: ManageQuestsPage,
  activity: QuestActivityPage,
  points: PointsHistoryPage,
  send: SendPointsPage,
  requests: StaffRequestsPage,
  distribute: DistributePointsPage,
  distlog: DistributionHistoryPage,
};

export class App {
  #supabase;
  #auth;
  #page = null;
  #allowedPages = new Set();
  #onHashChange;

  constructor({ supabase, auth }) {
    this.#supabase = supabase;
    this.#auth = auth;
    this.db = supabase.client;
    this.user = null;
    this.nav = document.getElementById('nav');
    this.view = document.getElementById('view');
    this.userName = document.getElementById('userName');
    this.roleBadge = document.getElementById('roleBadge');
    this.#onHashChange = () => this.#navigate();
  }

  async start() {
    new ThemeManager().attachTo(document.getElementById('themeToggle'));
    document.getElementById('logoutBtn').addEventListener('click', () => this.#logout());

    try {
      if (!(await this.#auth.hasSession())) {
        location.replace('login.html');
        return;
      }

      this.user = await this.#auth.loadUser();
      if (!this.user) {
        await this.#auth.signOut();
        location.replace('login.html');
        return;
      }

      this.userName.textContent = this.user.fullName || this.user.email;
      this.roleBadge.textContent = this.user.roleLabel;

      if (!this.user.isActive) {
        this.#page = new WaitingPage(this);
        await this.#page.render(this.view);
        this.nav.replaceChildren();
        return;
      }

      const items = this.user.navItems();
      this.#allowedPages = new Set(items.map((item) => item.id));
      mount(this.nav, items.map((item) => h('a', {
        href: `#${item.id}`,
        class: 'nav-item',
        'data-page': item.id,
      }, item.label)));

      window.addEventListener('hashchange', this.#onHashChange);
      await this.#navigate();
    } catch (error) {
      mount(this.view, h('section', { class: 'panel' },
        h('h1', { class: 'page-title' }, 'Unable to open SCsystem'),
        h('p', { class: 'error-text' }, error.message || 'The account profile could not be loaded.'),
        h('a', { class: 'btn btn-secondary', href: 'login.html' }, 'Return to login')));
    }
  }

  async #navigate() {
    if (!this.user || !this.user.isActive) return;
    let pageId = location.hash.replace(/^#/, '') || 'home';
    if (!this.#allowedPages.has(pageId) || !PAGES[pageId]) pageId = 'home';
    if (location.hash !== `#${pageId}`) history.replaceState(null, '', `#${pageId}`);

    this.#page?.destroy();
    const PageType = PAGES[pageId];
    this.#page = new PageType(this);

    this.nav.querySelectorAll('[data-page]').forEach((link) => {
      link.classList.toggle('active', link.dataset.page === pageId);
      if (link.dataset.page === pageId) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    try {
      await this.#page.render(this.view);
    } catch (error) {
      mount(this.view, h('section', { class: 'panel' },
        h('h1', { class: 'page-title' }, 'This page could not be loaded'),
        h('p', { class: 'error-text' }, error.message || 'Please try again.')));
    }
  }

  async #logout() {
    const button = document.getElementById('logoutBtn');
    button.disabled = true;
    try {
      this.#page?.destroy();
      await this.#auth.signOut();
      location.replace('index.html');
    } catch (error) {
      button.disabled = false;
      this.#page?.toast(error.message || 'Could not log out.', 'error');
    }
  }
}
