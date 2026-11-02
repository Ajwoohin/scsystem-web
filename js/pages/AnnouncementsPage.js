import { Page } from './Page.js';
import { h, mount, fmtDate } from '../dom.js';

const REACTIONS = { like: '👍', heart: '❤️', surprise: '😮' };
const UNIT_MINUTES = { Minutes: 1, Hours: 60, Days: 1440 };

export class AnnouncementsPage extends Page {
  #tab = 'news';
  #open = new Set();
  #drafts = new Map();
  #items = [];
  #reactions = [];
  #comments = [];

  get title() {
    return 'Announcements';
  }

  build() {
    this.tabsHost = h('div', { class: 'tabs' });
    this.body = h('div', { class: 'stack' });
    const composer = this.user.canPost ? this.#buildComposer() : null;
    const add = this.user.canPost
      ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { composer.hidden = !composer.hidden; } }, '+ New announcement')
      : null;
    mount(this.root, h('div', { class: 'page-head' }, h('h1', { class: 'page-title' }, this.title), add), composer, this.tabsHost, this.body);
  }

  async render(root) {
    await super.render(root);
    this.watch('announcements');
    this.watch('announcement_reactions');
    this.watch('announcement_comments');
  }

  async load() {
    const rows = await this.run(this.db.from('announcements').select('*').order('created_at', { ascending: false }));
    const now = Date.now();
    this.#items = rows.filter((a) => !a.auto_delete_at || new Date(a.auto_delete_at).getTime() > now);
    const ids = this.#items.map((a) => a.id);
    this.#reactions = ids.length ? await this.run(this.db.from('announcement_reactions').select('*').in('announcement_id', ids)) : [];
    this.#comments = ids.length
      ? await this.run(this.db.from('announcement_comments').select('*').in('announcement_id', ids).order('created_at', { ascending: true }))
      : [];
  }

  draw() {
    mount(this.tabsHost, [['news', 'News'], ['club', 'Club News']].map(([id, label]) =>
      h('button', { class: `tab${this.#tab === id ? ' active' : ''}`, type: 'button', onclick: () => { this.#tab = id; this.draw(); } }, label)));
    const visible = this.#items.filter((a) => a.category === this.#tab);
    mount(this.body, visible.length ? visible.map((a) => this.#card(a)) : h('p', { class: 'empty' }, 'No announcements yet.'));
  }

  #card(item) {
    const reactions = this.#reactions.filter((r) => r.announcement_id === item.id);
    const mine = reactions.find((r) => r.user_id === this.user.id)?.reaction_type;
    const comments = this.#comments.filter((c) => c.announcement_id === item.id);

    const pills = Object.entries(REACTIONS).map(([type, emoji]) => {
      const count = reactions.filter((r) => r.reaction_type === type).length;
      return h('button', { class: `pill${mine === type ? ' active' : ''}`, type: 'button', onclick: () => this.#react(item, type, mine) },
        emoji, count ? ` ${count}` : '');
    });
    const toggle = h('button', {
      class: 'pill', type: 'button',
      onclick: () => { this.#open.has(item.id) ? this.#open.delete(item.id) : this.#open.add(item.id); this.draw(); },
    }, `💬 ${comments.length}`);

    return h('article', { class: 'panel announcement' },
      item.image_url ? h('a', { href: item.image_url, target: '_blank', rel: 'noopener' }, h('img', { class: 'announce-img', src: item.image_url, alt: '' })) : null,
      h('div', { class: 'page-head' },
        h('div', null,
          h('h3', { class: 'announce-title' }, item.title),
          h('div', { class: 'muted small' }, `${item.posted_by ?? ''} • ${fmtDate(item.created_at)}`)),
        this.user.canPost ? h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => this.#remove(item) }, 'Delete') : null),
      h('p', { class: 'announce-text' }, item.description),
      h('div', { class: 'row' }, pills, h('span', { class: 'grow' }), toggle),
      this.#open.has(item.id) ? this.#thread(item, comments) : null);
  }

  #thread(item, comments) {
    const input = h('input', { type: 'text', placeholder: 'Write a comment...', oninput: (e) => this.#drafts.set(item.id, e.target.value) });
    input.value = this.#drafts.get(item.id) ?? '';
    const send = () => this.#comment(item, input.value);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    return h('div', { class: 'thread' },
      comments.length ? comments.map((c) => h('div', { class: 'comment' }, h('strong', null, c.author_name), h('div', null, c.comment_text))) : h('p', { class: 'muted small' }, 'No comments yet.'),
      h('div', { class: 'row' }, input, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: send }, 'Post')));
  }

  async #react(item, type, mine) {
    try {
      const table = this.db.from('announcement_reactions');
      if (mine === type) {
        await this.run(table.delete().eq('announcement_id', item.id).eq('user_id', this.user.id));
      } else {
        await this.run(table.upsert(
          { announcement_id: item.id, user_id: this.user.id, reaction_type: type },
          { onConflict: 'announcement_id,user_id' },
        ));
      }
      await this.refresh();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }

  async #comment(item, text) {
    const clean = text.trim();
    if (!clean) return;
    try {
      await this.run(this.db.from('announcement_comments').insert({
        announcement_id: item.id, user_id: this.user.id, author_name: this.user.fullName, comment_text: clean,
      }));
      this.#drafts.delete(item.id);
      await this.refresh();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }

  async #remove(item) {
    if (!this.ask('Delete this announcement?')) return;
    try {
      await this.run(this.db.from('announcements').delete().eq('id', item.id));
      await this.refresh();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }

  #buildComposer() {
    const title = h('input', { type: 'text', placeholder: 'Title' });
    const description = h('textarea', { rows: 4, placeholder: 'Description' });
    const category = h('select', null, h('option', { value: 'news' }, 'News'), h('option', { value: 'club' }, 'Club News'));
    const image = h('input', { type: 'file', accept: 'image/*' });
    const amount = h('input', { type: 'number', min: 1, max: 99 });
    amount.value = 30;
    const unit = h('select', null, Object.keys(UNIT_MINUTES).map((u) => h('option', { value: u }, u)));
    const timer = h('div', { class: 'row', hidden: true }, amount, unit);
    const auto = h('input', { type: 'checkbox', onchange: (e) => { timer.hidden = !e.target.checked; } });

    const post = h('button', { class: 'btn btn-primary', type: 'button' }, 'Post announcement');
    post.addEventListener('click', async () => {
      if (!title.value.trim() || !description.value.trim()) {
        this.toast('Please fill in title and description.', 'error');
        return;
      }
      post.disabled = true;
      try {
        let imageUrl = null;
        const file = image.files[0];
        if (file) {
          const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
          const path = `announcement_${Date.now()}.${extension}`;
          const upload = await this.db.storage.from('announcement-images').upload(path, file, { contentType: file.type || 'image/jpeg' });
          if (upload.error) throw upload.error;
          imageUrl = this.db.storage.from('announcement-images').getPublicUrl(path).data.publicUrl;
        }
        const minutes = (Number(amount.value) || 1) * UNIT_MINUTES[unit.value];
        await this.run(this.db.from('announcements').insert({
          title: title.value.trim(),
          description: description.value.trim(),
          image_url: imageUrl,
          category: category.value,
          posted_by: this.user.postedByName,
          auto_delete_at: auto.checked ? new Date(Date.now() + minutes * 60000).toISOString() : null,
        }));
        title.value = '';
        description.value = '';
        image.value = '';
        auto.checked = false;
        timer.hidden = true;
        composer.hidden = true;
        this.toast('Announcement posted.', 'success');
        await this.refresh();
      } catch (error) {
        this.toast(error.message, 'error');
      } finally {
        post.disabled = false;
      }
    });

    const composer = h('section', { class: 'panel stack', hidden: true },
      h('h3', null, 'New announcement'),
      h('div', { class: 'field' }, h('label', null, 'Title'), title),
      h('div', { class: 'field' }, h('label', null, 'Description'), description),
      h('div', { class: 'row' }, h('div', { class: 'field grow' }, h('label', null, 'Category'), category),
        h('div', { class: 'field grow' }, h('label', null, 'Image (optional)'), image)),
      h('label', { class: 'check' }, auto, ' Auto delete after a set time'),
      timer,
      post);
    return composer;
  }
}
