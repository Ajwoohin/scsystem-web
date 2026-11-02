import { Page } from './Page.js';
import { h, mount } from '../dom.js';

class QrView {
  static async create(text) {
    try {
      const module = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
      const QRCode = module.default ?? module;
      const canvas = h('canvas');
      await QRCode.toCanvas(canvas, text, { width: 190, margin: 1 });
      return h('div', { class: 'qr-box' }, canvas);
    } catch (error) {
      return h('p', { class: 'muted' }, 'QR code is not available right now.');
    }
  }
}

export class HomePage extends Page {
  #bioDraft = null;
  #tiles = [];
  #busCount = null;
  #announcements = [];
  #announcementCount = null;
  #openQuestCount = null;

  get title() {
    return 'Home';
  }

  async render(root) {
    await super.render(root);
    this.watch('point_transactions', `student_id=eq.${this.user.id}`);
    ['buses', 'announcements', 'quests', 'quest_acceptances'].forEach((table) => this.watch(table));
  }

  async load() {
    await this.user.refreshPoints(this.db);
    this.#tiles = [];

    const [buses, announcements, quests] = await Promise.allSettled([
      this.run(this.db.from('buses').select('id')),
      this.run(this.db.from('announcements').select('id, title, category, created_at, auto_delete_at').order('created_at', { ascending: false })),
      this.run(this.db.from('quests').select('id, status')),
    ]);
    this.#busCount = buses.status === 'fulfilled' ? buses.value.length : null;
    this.#announcements = announcements.status === 'fulfilled' ? announcements.value : [];
    const activeAnnouncements = this.#announcements.filter((row) => !row.auto_delete_at || new Date(row.auto_delete_at).getTime() > Date.now());
    this.#announcementCount = announcements.status === 'fulfilled' ? activeAnnouncements.length : null;
    this.#announcements = activeAnnouncements.slice(0, 3);
    this.#openQuestCount = quests.status === 'fulfilled'
      ? quests.value.filter((row) => (row.status || 'open') !== 'completed').length
      : null;
    if (this.user.canPost) {
      const mine = await this.run(this.db.from('quests').select('id').eq('posted_by_id', this.user.id));
      let pending = 0;
      if (mine.length) {
        const rows = await this.run(
          this.db.from('quest_acceptances').select('id').eq('status', 'pending_review').in('quest_id', mine.map((q) => q.id)),
        );
        pending = rows.length;
      }
      this.#tiles.push({ label: 'Quest submissions to review', value: pending, href: '#activity' });
    }
    if (this.user.isAdmin) {
      const rows = await this.run(this.db.from('staff').select('id').eq('status', 'pending'));
      this.#tiles.push({ label: 'Pending staff requests', value: rows.length, href: '#requests' });
    }
  }

  draw() {
    const user = this.user;
    const rows = user.profileRows().map(([label, value]) =>
      h('div', { class: 'info-row' }, h('span', { class: 'muted' }, label), h('strong', null, value)));

    const avatar = user.photoUrl
      ? h('img', { class: 'avatar', src: user.photoUrl, alt: 'Profile photo' })
      : h('div', { class: 'avatar' }, (user.fullName[0] ?? '?').toUpperCase());

    const head = h('div', { class: 'profile-head' },
      avatar,
      h('div', null,
        h('h2', { class: 'profile-name' }, user.fullName),
        h('span', { class: 'badge blue' }, user.roleLabel)));

    const welcomeText = user.isAdmin
      ? 'Manage staff access and keep buses, announcements, and quests up to date.'
      : user.roleLabel === 'Teacher'
        ? 'Share campus updates, manage quests, and review student submissions.'
        : 'Keep track of your points, join quests, and stay up to date with campus announcements.';
    const welcome = h('section', { class: 'panel home-welcome' },
      h('div', null,
        h('span', { class: 'home-eyebrow' }, 'YOUR CAMPUS, CONNECTED'),
        h('h2', null, user.isAdmin ? 'Administration overview' : `Hello, ${user.fullName.split(/\s+/)[0] || 'there'}`),
        h('p', null, welcomeText)),
      h('span', { class: 'home-welcome-mark', 'aria-hidden': 'true' }, '✦'));

    const stat = (label, value, note, href) => href
      ? h('a', { class: 'tile home-stat', href }, h('span', { class: 'muted' }, label), h('strong', null, value ?? '—'), h('small', { class: 'muted' }, note))
      : h('div', { class: 'tile home-stat' }, h('span', { class: 'muted' }, label), h('strong', null, value ?? '—'), h('small', { class: 'muted' }, note));
    const stats = h('div', { class: 'tiles' },
      stat('SCpoints', user.isAdmin ? 'Admin' : String(user.scPoints), 'Current points balance', user.isAdmin ? null : '#points'),
      stat('Buses listed', this.#busCount == null ? '—' : String(this.#busCount), 'Live transport status', '#buses'),
      stat('Announcements', this.#announcementCount == null ? '—' : String(this.#announcementCount), 'Current campus posts', '#announcements'),
      stat('Open quests', this.#openQuestCount == null ? '—' : String(this.#openQuestCount), 'Available or ongoing', '#quests'));

    const profile = h('section', { class: 'panel' }, head, h('div', { class: 'info-list' }, rows));
    const taskTiles = this.#tiles.length
      ? h('div', { class: 'tiles' }, this.#tiles.map((t) =>
        h('a', { class: 'tile', href: t.href }, h('strong', null, String(t.value)), h('span', { class: 'muted' }, t.label))))
      : null;

    const recent = this.#announcements.length
      ? h('div', { class: 'list' }, this.#announcements.map((item) =>
        h('a', { class: 'list-row home-recent', href: '#announcements' },
          h('div', { class: 'grow' },
            h('strong', null, item.title || 'Untitled announcement'),
            h('span', { class: 'muted small' }, `${item.category === 'club' ? 'Club News' : 'News'} · ${new Date(item.created_at).toLocaleDateString()}`)),
          h('span', { class: 'muted' }, '›'))))
      : h('p', { class: 'empty' }, 'No current announcements. New campus posts will appear here.');
    const recentPanel = h('section', { class: 'panel home-panel' },
      h('div', { class: 'panel-heading' }, h('h3', null, 'Recent announcements'), h('a', { href: '#announcements' }, 'View all')),
      recent);
    const quickLinks = user.navItems().filter((item) => ['home', 'announcements', 'buses', 'quests', 'points', 'send', 'requests'].includes(item.id) && item.id !== 'home');
    const quickPanel = h('section', { class: 'panel home-panel' },
      h('div', { class: 'panel-heading' }, h('h3', null, 'Quick access')),
      h('div', { class: 'home-quick-links' }, quickLinks.map((item) => h('a', { class: 'tile', href: `#${item.id}` }, item.label))));

    mount(this.body, welcome, stats, profile, taskTiles, h('div', { class: 'home-columns' }, recentPanel, quickPanel));

    if (user.hasProfileEditor) this.#drawEditor(profile, head);
  }

  #drawEditor(profile, head) {
    const user = this.user;
    const photoInput = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => this.#changePhoto(e.target.files[0]) });
    head.append(h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => photoInput.click() }, 'Change photo'), photoInput);

    const bio = h('textarea', {
      rows: 4, maxLength: 1000, placeholder: 'Tell others a bit about yourself...',
      oninput: (e) => { this.#bioDraft = e.target.value; },
    });
    bio.value = this.#bioDraft ?? user.bio;
    const save = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => this.#saveBio() }, 'Save bio');
    profile.append(h('div', { class: 'field' }, h('label', null, 'Bio'), bio), save);

    if (user.edpNumber) {
      const host = h('section', { class: 'panel center' }, h('h3', null, 'Your EDP QR code'));
      this.body.append(host);
      QrView.create(user.edpNumber).then((qr) => host.append(qr, h('p', { class: 'muted' }, 'This QR code contains your unique EDP number. You can also enter the EDP manually when sending points on the website.')));
    }
  }

  async #saveBio() {
    try {
      this.user.bio = this.#bioDraft ?? this.user.bio;
      await this.run(this.db.from('students').update({ bio: this.user.bio }).eq('id', this.user.id));
      this.#bioDraft = null;
      this.toast('Bio saved.', 'success');
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }

  async #changePhoto(file) {
    if (!file) return;
    try {
      const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `profile_${this.user.id}_${Date.now()}.${extension}`;
      const upload = await this.db.storage.from('profile-photos').upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (upload.error) throw upload.error;
      const { data } = this.db.storage.from('profile-photos').getPublicUrl(path);
      await this.run(this.db.from('students').update({ profile_photo_url: data.publicUrl }).eq('id', this.user.id));
      this.user.photoUrl = data.publicUrl;
      this.toast('Photo updated.', 'success');
      this.draw();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }
}
