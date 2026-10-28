import { ThemeManager } from './ThemeManager.js';
import { SupabaseService } from './SupabaseService.js';
import { AuthService } from './AuthService.js';

class DashboardApp {
  #auth;
  #client;
  #theme;
  #user;
  #account;
  #role = 'student';
  #view = 'overview';
  #buses = [];
  #announcements = [];
  #reactions = [];
  #comments = [];
  #quests = [];
  #acceptances = [];
  #staffRequests = [];
  #students = {};
  #proofFiles = {};
  #announcementFilter = 'all';
  #expandedComments = new Set();
  #channels = [];
  #notifyTimer;

  constructor() {
    const service = new SupabaseService();
    this.#auth = new AuthService(service);
    this.#client = service.client;
    this.#theme = new ThemeManager();
    this.#theme.attachTo(document.getElementById('themeToggle'));
  }

  async start() {
    const { data: { session } } = await this.#client.auth.getSession();
    if (!session) {
      location.replace('login.html');
      return;
    }

    this.#user = session.user;
    try {
      this.#account = await this.#auth.getAccount(this.#user);
      this.#role = this.#account.role;
      if (this.#role === 'staff' && this.#account.status !== 'approved') {
        await this.#auth.signOut();
        location.replace(`login.html?message=${this.#account.status === 'declined' ? 'declined' : 'pending'}`);
        return;
      }
      this.#setupPage();
      await this.#loadAll();
      this.#subscribe();
      window.addEventListener('beforeunload', () => this.#channels.forEach((channel) => this.#client.removeChannel(channel)));
    } catch (error) {
      await this.#auth.signOut().catch(() => {});
      location.replace(`login.html?error=${encodeURIComponent(error.message || 'Could not load your account')}`);
    }
  }

  #setupPage() {
    const name = this.#displayName();
    document.getElementById('roleBadge').textContent = this.#role === 'admin' ? 'Administrator' : this.#role;
    document.getElementById('sideName').textContent = name;
    document.getElementById('sideEmail').textContent = this.#user.email || '';
    document.getElementById('welcomeTitle').textContent = `Welcome back, ${name.split(' ')[0] || 'there'}`;
    document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date());
    this.#setAvatar(document.getElementById('sideAvatar'), this.#profilePhoto(), name);

    document.querySelectorAll('[data-view-nav]').forEach((button) => {
      const allowedRole = button.dataset.role;
      if (allowedRole && allowedRole !== this.#role) button.hidden = true;
      button.addEventListener('click', () => this.#showView(button.dataset.viewNav));
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try { await this.#auth.signOut(); } finally { location.replace('login.html'); }
    });

    document.querySelector('.app-main').addEventListener('click', (event) => this.#onClick(event));
    document.querySelector('.app-main').addEventListener('submit', (event) => this.#onSubmit(event));
    document.querySelector('.app-main').addEventListener('change', (event) => this.#onChange(event));
  }

  async #loadAll() {
    const tasks = [this.#refreshProfile(), this.#refreshBuses(), this.#refreshAnnouncements(), this.#refreshQuests()];
    if (this.#role === 'admin') tasks.push(this.#refreshStaffRequests());
    const results = await Promise.allSettled(tasks);
    const failed = results.filter((item) => item.status === 'rejected');
    if (failed.length) this.#notify('Some content could not be loaded. Check your Supabase table permissions and try refreshing.', 'error');
    this.#renderAll();
  }

  async #refreshProfile() {
    if (this.#role === 'admin') return;
    const table = this.#role === 'staff' ? 'staff' : 'students';
    const { data, error } = await this.#client.from(table).select('*').eq('id', this.#user.id).single();
    if (error) throw error;
    this.#account.profile = data;
    this.#setAvatar(document.getElementById('sideAvatar'), this.#profilePhoto(), this.#displayName());
    document.getElementById('sideName').textContent = this.#displayName();
    document.getElementById('welcomeTitle').textContent = `Welcome back, ${this.#displayName().split(' ')[0] || 'there'}`;
  }

  async #refreshBuses() {
    const { data, error } = await this.#client.from('buses').select('*');
    if (error) throw error;
    this.#buses = (data || []).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    this.#renderCurrentIf('buses');
    this.#renderOverviewIfActive();
  }

  async #refreshAnnouncements() {
    const { data, error } = await this.#client.from('announcements').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    this.#announcements = data || [];
    const ids = this.#announcements.map((item) => item.id).filter(Boolean);
    if (ids.length) {
      const [reactionResult, commentResult] = await Promise.all([
        this.#client.from('announcement_reactions').select('*').in('announcement_id', ids),
        this.#client.from('announcement_comments').select('*').in('announcement_id', ids).order('created_at', { ascending: true }),
      ]);
      if (!reactionResult.error) this.#reactions = reactionResult.data || [];
      if (!commentResult.error) this.#comments = commentResult.data || [];
    } else {
      this.#reactions = [];
      this.#comments = [];
    }
    this.#renderCurrentIf('announcements');
    this.#renderOverviewIfActive();
  }

  async #refreshQuests() {
    const [questResult, acceptanceResult] = await Promise.all([
      this.#client.from('quests').select('*').order('created_at', { ascending: false }),
      this.#client.from('quest_acceptances').select('*'),
    ]);
    if (questResult.error) throw questResult.error;
    if (acceptanceResult.error) throw acceptanceResult.error;
    this.#quests = questResult.data || [];
    this.#acceptances = acceptanceResult.data || [];
    await this.#loadStudentNames();
    this.#renderCurrentIf('quests');
    this.#renderOverviewIfActive();
  }

  async #loadStudentNames() {
    const ids = [...new Set(this.#acceptances.map((row) => row.student_id).filter(Boolean))]
      .filter((id) => !this.#students[id]);
    if (!ids.length) return;
    const { data, error } = await this.#client.from('students').select('id, full_name, edp_number').in('id', ids);
    if (error) return;
    (data || []).forEach((student) => { this.#students[student.id] = student; });
  }

  async #refreshStaffRequests() {
    const { data, error } = await this.#client.from('staff').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (error) throw error;
    this.#staffRequests = data || [];
    const count = document.getElementById('pendingStaffCount');
    count.textContent = this.#staffRequests.length;
    count.hidden = !this.#staffRequests.length;
    this.#renderCurrentIf('staff-requests');
    this.#renderOverviewIfActive();
  }

  #subscribe() {
    const tables = ['buses', 'announcements', 'announcement_reactions', 'announcement_comments', 'quests', 'quest_acceptances'];
    if (this.#role === 'admin') tables.push('staff');
    tables.forEach((table) => {
      const channel = this.#client.channel(`scsystem-web-${table}-${Math.random().toString(36).slice(2, 8)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          const refresh = {
            buses: () => this.#refreshBuses(),
            announcements: () => this.#refreshAnnouncements(),
            announcement_reactions: () => this.#refreshAnnouncements(),
            announcement_comments: () => this.#refreshAnnouncements(),
            quests: () => this.#refreshQuests(),
            quest_acceptances: () => this.#refreshQuests(),
            staff: () => this.#refreshStaffRequests(),
          }[table];
          refresh?.().catch(() => {});
        }).subscribe();
      this.#channels.push(channel);
    });

    if (this.#role !== 'admin') {
      const table = this.#role === 'staff' ? 'staff' : 'students';
      const channel = this.#client.channel(`scsystem-web-profile-${this.#user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, filter: `id=eq.${this.#user.id}` }, () => {
          this.#refreshProfile().then(() => this.#renderProfile()).catch(() => {});
        }).subscribe();
      this.#channels.push(channel);
    }
  }

  #showView(view) {
    if (view === 'staff-requests' && this.#role !== 'admin') return;
    this.#view = view;
    document.querySelectorAll('[data-view-nav]').forEach((button) => button.classList.toggle('active', button.dataset.viewNav === view));
    document.querySelectorAll('.view').forEach((section) => {
      const active = section.id === `view-${view}`;
      section.hidden = !active;
      section.classList.toggle('active', active);
    });
    this.#renderCurrent();
  }

  #renderAll() {
    this.#renderOverview();
    this.#renderProfile();
    this.#renderBuses();
    this.#renderAnnouncements();
    this.#renderQuests();
    if (this.#role === 'admin') this.#renderStaffRequests();
  }

  #renderCurrent() {
    const renderers = {
      overview: () => this.#renderOverview(),
      profile: () => this.#renderProfile(),
      buses: () => this.#renderBuses(),
      announcements: () => this.#renderAnnouncements(),
      quests: () => this.#renderQuests(),
      'staff-requests': () => this.#renderStaffRequests(),
    };
    renderers[this.#view]?.();
  }

  #renderCurrentIf(view) { if (this.#view === view) this.#renderCurrent(); }
  #renderOverviewIfActive() { if (this.#view === 'overview') this.#renderOverview(); }

  #renderOverview() {
    const profile = this.#account.profile || {};
    const activeAnnouncements = this.#visibleAnnouncements().length;
    const activeQuests = this.#quests.filter((quest) => (quest.status || 'open') !== 'completed').length;
    const stats = [
      ['✦', 'SCpoints', this.#role === 'admin' ? 'Admin' : Number(profile.sc_points || 0).toLocaleString(), this.#role === 'admin' ? 'Administrator access' : 'Current points balance'],
      ['▰', 'Buses listed', this.#buses.length, 'Live transport status'],
      ['▤', 'Announcements', activeAnnouncements, 'Current campus posts'],
      ['☑', 'Open quests', activeQuests, 'Available or ongoing quests'],
    ];
    const statHtml = stats.map(([icon, label, value, note]) => `<article class="stat-card"><div class="stat-icon">${icon}</div><span class="stat-label">${label}</span><strong class="stat-value">${escapeHtml(value)}</strong><div class="stat-note">${note}</div></article>`).join('');
    const photo = this.#profilePhoto();
    const miniAvatar = photo ? `<img src="${escapeAttr(photo)}" alt="Profile photo">` : escapeHtml(this.#initials(this.#displayName()));
    const roleLabel = this.#role === 'admin' ? 'School Administrator' : this.#role === 'staff' ? 'Faculty / Staff' : 'Student';
    const profile = this.#account.profile || {};
    const profileLine = this.#role === 'student'
      ? `EDP ${escapeHtml(profile.edp_number || '—')} · ${Number(profile.sc_points || 0).toLocaleString()} SCpoints`
      : `${roleLabel} · ${Number(profile.sc_points || 0).toLocaleString()} SCpoints`;
    const recent = this.#visibleAnnouncements().slice(0, 3);
    const recentHtml = recent.length ? recent.map((item) => `<div class="recent-item"><span class="recent-dot"></span><div><strong>${escapeHtml(item.title || 'Untitled announcement')}</strong><small>${escapeHtml(item.category === 'club' ? 'Club News' : 'News')} · ${escapeHtml(this.#formatDate(item.created_at))}</small></div></div>`).join('') : '<div class="empty-state"><strong>No current announcements</strong>New posts from the app will appear here.</div>';
    document.getElementById('overviewContent').innerHTML = `
      <div class="welcome-card"><div class="welcome-copy"><p class="eyebrow">YOUR CAMPUS, CONNECTED</p><h2>${this.#role === 'admin' ? 'Administration overview' : `Hello, ${escapeHtml(this.#displayName())}`}</h2><p>${this.#role === 'student' ? 'Keep track of your points, join quests, and stay up to date with your campus.' : this.#role === 'staff' ? 'Manage announcements, review quest submissions, and keep campus updates in sync.' : 'Manage staff access and keep buses, announcements, and quests up to date for everyone.'}</p></div><div class="welcome-art">✦</div></div>
      <section class="panel home-profile"><div class="home-profile-avatar avatar">${miniAvatar}</div><div class="home-profile-info"><span class="eyebrow">YOUR PROFILE</span><h2>${escapeHtml(this.#displayName())}</h2><p>${profileLine}</p>${this.#role === 'student' && profile.bio ? `<small>${escapeHtml(profile.bio)}</small>` : ''}</div><button class="btn btn-secondary btn-small home-profile-button" data-action="view" data-view="profile">View profile</button></section>
      <div class="stats-grid">${statHtml}</div>
      <div class="dashboard-columns">
        <section class="panel"><div class="panel-header"><h2>Recent announcements</h2><button class="text-action" data-action="view" data-view="announcements">View all →</button></div><div class="panel-body recent-list">${recentHtml}</div></section>
        <section class="panel"><div class="panel-header"><h2>Quick access</h2></div><div class="panel-body"><div class="quick-actions">
          <button class="quick-action" data-action="view" data-view="profile"><span class="quick-icon">◉</span><span><strong>My Profile</strong><small>Account details and SCpoints</small></span></button>
          <button class="quick-action" data-action="view" data-view="buses"><span class="quick-icon">▰</span><span><strong>Bus Status</strong><small>See live bus locations/status</small></span></button>
          <button class="quick-action" data-action="view" data-view="quests"><span class="quick-icon">☑</span><span><strong>Quests</strong><small>${this.#role === 'student' ? 'Join activities and submit proof' : 'Manage quests and submissions'}</small></span></button>
          ${this.#role === 'admin' ? '<button class="quick-action" data-action="view" data-view="staff-requests"><span class="quick-icon">♙</span><span><strong>Staff Requests</strong><small>Review staff account requests</small></span></button>' : ''}
        </div></div></section>
      </div>`;
  }

  #renderProfile() {
    const profile = this.#account.profile || {};
    const name = this.#displayName();
    const photo = this.#profilePhoto();
    const role = this.#role === 'admin' ? 'School Administrator' : this.#role === 'staff' ? 'Faculty / Staff' : 'Student';
    const photoAvatar = photo ? `<img src="${escapeAttr(photo)}" alt="Profile photo">` : escapeHtml(this.#initials(name));
    const details = this.#role === 'student'
      ? `<div class="profile-details"><div class="detail-item"><span>EDP Number</span><strong>${escapeHtml(profile.edp_number || 'Not set')}</strong></div><div class="detail-item"><span>SCpoints</span><strong>${Number(profile.sc_points || 0).toLocaleString()}</strong></div><div class="detail-item"><span>Institutional Email</span><strong>${escapeHtml(this.#user.email || '—')}</strong></div><div class="detail-item"><span>Account Role</span><strong>Student</strong></div></div>`
      : `<div class="profile-details"><div class="detail-item"><span>Account Role</span><strong>${role}</strong></div><div class="detail-item"><span>SCpoints</span><strong>${Number(profile.sc_points || 0).toLocaleString()}</strong></div><div class="detail-item"><span>Email</span><strong>${escapeHtml(this.#user.email || '—')}</strong></div><div class="detail-item"><span>Account Status</span><strong>${this.#role === 'admin' ? 'Active' : escapeHtml(profile.status || 'Approved')}</strong></div></div>`;
    document.getElementById('profileContent').innerHTML = `
      <div class="profile-layout">
        <section class="panel"><div class="profile-cover"></div><div class="profile-main"><div class="profile-avatar-row"><div class="avatar profile-avatar">${photoAvatar}</div><div class="profile-name"><h2>${escapeHtml(name)}</h2><p>${role}</p></div></div>${details}
          ${this.#role === 'student' ? `<div class="form-field" style="margin-top:20px"><label for="profileBio">Bio</label><textarea id="profileBio" maxlength="1000" placeholder="Tell others a bit about yourself...">${escapeHtml(profile.bio || '')}</textarea><small class="form-hint">Up to 1,000 characters.</small><div class="btn-row"><button class="btn btn-primary btn-small" data-action="save-bio">Save bio</button></div></div><div class="form-field" style="margin-top:20px"><label for="profilePhoto">Profile photo</label><input class="file-input" id="profilePhoto" type="file" accept="image/*"><small class="form-hint">Upload an image to sync your profile photo with the app.</small><div class="btn-row"><button class="btn btn-secondary btn-small" data-action="upload-photo">Upload photo</button></div></div>` : ''}
        </div></section>
        <section class="panel"><div class="panel-header"><h2>Student QR Code</h2></div><div class="panel-body qr-panel">${this.#role === 'student' && profile.qr_code_id ? `<canvas id="profileQr"></canvas><p class="form-hint">Show this code when points are being sent to you.</p><div class="qr-code-text">${escapeHtml(profile.qr_code_id)}</div>` : `<div class="empty-state"><strong>${this.#role === 'student' ? 'QR code not set' : 'QR code unavailable'}</strong>${this.#role === 'student' ? 'Your app profile may need to finish syncing.' : 'QR point transfers are managed in the mobile app.'}</div>`}</div></section>
      </div>`;
    if (this.#role === 'student' && profile.qr_code_id && window.QRCode) {
      window.QRCode.toCanvas(document.getElementById('profileQr'), profile.qr_code_id, { width: 180, margin: 1 }, (error) => {
        if (error) this.#notify('Could not create the QR code on this device.', 'error');
      });
    }
  }

  #renderBuses() {
    const content = document.getElementById('busContent');
    if (!this.#buses.length) {
      content.innerHTML = '<div class="empty-state"><strong>No buses found</strong>The app and website both read the public <code>buses</code> table. Add bus records there to show their live status.</div>';
      return;
    }
    const cards = this.#buses.map((bus) => {
      const status = bus.status || 'unknown';
      const kind = status.includes('going_to') ? 'moving' : status === 'on_break' ? 'break' : 'waiting';
      const statusSelect = this.#role === 'admin' ? `<label class="form-hint" for="bus-${escapeAttr(bus.id)}">Change status</label><select class="bus-control" id="bus-${escapeAttr(bus.id)}" data-action="bus-status" data-id="${escapeAttr(bus.id)}">${this.#busOptions(status)}</select>` : '';
      return `<article class="bus-card"><div class="bus-title-row"><div class="bus-icon">▰</div><div><h3>${escapeHtml(bus.name || 'Campus Bus')}</h3><div class="bus-subtitle">Updated ${escapeHtml(this.#formatDate(bus.updated_at))}</div></div></div><div class="bus-status ${kind}">${escapeHtml(this.#busLabel(status))}</div>${statusSelect}</article>`;
    }).join('');
    content.innerHTML = `<div class="bus-grid">${cards}</div>`;
  }

  #busOptions(current) {
    const options = [['going_to_main', 'Going to Main'], ['going_to_buena', 'Going to Buena'], ['on_break', 'On Break'], ['waiting_in_buena', 'Waiting in Buena'], ['waiting_in_main', 'Waiting in Main']];
    return options.map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('');
  }

  #renderAnnouncements() {
    const content = document.getElementById('announcementsContent');
    const isManager = ['admin', 'staff'].includes(this.#role);
    const composer = isManager ? `<section class="panel"><div class="panel-header"><h2>Post an announcement</h2><span class="tag">Shared with the app</span></div><div class="panel-body"><form data-form="announcement"><div class="form-grid"><div class="form-field"><label for="announcementTitle">Title</label><input id="announcementTitle" name="title" maxlength="160" required></div><div class="form-field"><label for="announcementCategory">Category</label><select id="announcementCategory" name="category"><option value="news">News</option><option value="club">Club News</option></select></div><div class="form-field full"><label for="announcementDescription">Description</label><textarea id="announcementDescription" name="description" required></textarea></div><div class="form-field"><label for="announcementImage">Image (optional)</label><input id="announcementImage" class="file-input" name="image" type="file" accept="image/*"><small class="form-hint">Uses the announcement-images storage bucket.</small></div><div class="form-field"><label for="announcementExpiry">Auto-delete after</label><div class="form-grid" style="grid-template-columns: .7fr 1fr"><input id="announcementExpiry" name="expiryNumber" type="number" min="1" max="999" value="30"><select name="expiryUnit"><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></div><label style="display:flex;align-items:center;gap:7px;font-weight:500"><input type="checkbox" name="autoDelete"> Automatically remove this post later</label></div></div><div class="btn-row"><button type="submit" class="btn btn-primary btn-small">Publish announcement</button></div><p class="form-error" data-form-error hidden></p></form></div></section>` : '';
    const filter = `<div class="announcement-filters">${[['all', 'All'], ['news', 'News'], ['club', 'Club News']].map(([key, label]) => `<button class="filter-btn ${this.#announcementFilter === key ? 'active' : ''}" data-action="announcement-filter" data-filter="${key}">${label}</button>`).join('')}</div>`;
    const items = this.#visibleAnnouncements().filter((item) => this.#announcementFilter === 'all' || item.category === this.#announcementFilter);
    const feed = items.length ? items.map((item) => this.#announcementCard(item)).join('') : '<div class="empty-state"><strong>No announcements here yet</strong>New posts from the mobile app will appear here automatically.</div>';
    content.innerHTML = `${composer}${filter}<div class="content-stack">${feed}</div>`;
  }

  #announcementCard(item) {
    const canDelete = ['admin', 'staff'].includes(this.#role);
    const reactions = [['like', '👍'], ['heart', '❤️'], ['surprise', '😮']];
    const myReactions = this.#reactions.find((row) => row.announcement_id === item.id && row.user_id === this.#user.id);
    const buttons = reactions.map(([type, emoji]) => {
      const count = this.#reactions.filter((row) => row.announcement_id === item.id && row.reaction_type === type).length;
      return `<button class="reaction-btn ${myReactions?.reaction_type === type ? 'mine' : ''}" data-action="react" data-id="${escapeAttr(item.id)}" data-reaction="${type}">${emoji} ${count || ''}</button>`;
    }).join('');
    const comments = this.#comments.filter((row) => row.announcement_id === item.id);
    const commentHtml = comments.length ? comments.map((comment) => `<div class="comment-item"><strong>${escapeHtml(comment.author_name || 'SCsystem user')}</strong><p>${escapeHtml(comment.comment_text || '')}</p></div>`).join('') : '<div class="form-hint">No comments yet.</div>';
    const image = item.image_url ? `<img class="announcement-image" src="${escapeAttr(item.image_url)}" alt="Announcement image" loading="lazy">` : '';
    const expanded = this.#expandedComments.has(item.id);
    return `<article class="announcement-card" id="announcement-${escapeAttr(item.id)}">${image}<div class="announcement-content"><div class="announcement-meta"><span class="tag">${item.category === 'club' ? 'Club News' : 'News'}</span><span>By ${escapeHtml(item.posted_by || 'SCsystem')}</span><span>·</span><span>${escapeHtml(this.#formatDate(item.created_at))}</span></div><h3>${escapeHtml(item.title || 'Untitled announcement')}</h3><p class="announcement-description">${escapeHtml(item.description || '')}</p><div class="card-footer-actions">${buttons}<button class="reaction-btn" data-action="toggle-comments" data-id="${escapeAttr(item.id)}">Comments (${comments.length})</button>${canDelete ? `<button class="reaction-btn" style="margin-left:auto;color:var(--danger)" data-action="delete-announcement" data-id="${escapeAttr(item.id)}">Delete</button>` : ''}</div><div class="comment-area" id="comments-${escapeAttr(item.id)}" ${expanded ? '' : 'hidden'}><div>${commentHtml}</div><form class="comment-form" data-form="comment" data-id="${escapeAttr(item.id)}"><input class="comment-input" name="comment" maxlength="1000" placeholder="Write a comment..." required><button class="btn btn-secondary btn-small" type="submit">Send</button></form></div></div></article>`;
  }

  #renderQuests() {
    const content = document.getElementById('questsContent');
    const isManager = ['admin', 'staff'].includes(this.#role);
    const composer = isManager ? `<section class="panel"><div class="panel-header"><h2>Create a quest</h2><span class="tag">Shared with the app</span></div><div class="panel-body"><form data-form="quest"><div class="form-grid"><div class="form-field"><label for="questTitle">Quest title</label><input id="questTitle" name="title" maxlength="160" required></div><div class="form-field"><label for="questReward">SCpoints reward</label><input id="questReward" name="reward" type="number" min="1" step="1" required></div><div class="form-field full"><label for="questDescription">Description</label><textarea id="questDescription" name="description" required></textarea></div><div class="form-field"><label for="questTime">Time limit</label><div class="form-grid" style="grid-template-columns:.7fr 1fr"><input id="questTime" name="timeNumber" type="number" min="1" max="999" value="20" required><select name="timeUnit"><option value="Minutes">Minutes</option><option value="Hours">Hours</option><option value="Days">Days</option></select></div></div><div class="form-field"><label for="questLimit">Acceptance limit</label><input id="questLimit" name="acceptanceLimit" type="number" min="1" step="1" value="20" required></div></div><div class="btn-row"><button type="submit" class="btn btn-primary btn-small">Create quest</button></div><p class="form-error" data-form-error hidden></p></form></div></section>` : '';
    const questCards = this.#quests.length ? this.#quests.map((quest) => this.#questCard(quest)).join('') : '<div class="empty-state"><strong>No quests have been posted yet</strong>Quests created in the mobile app will appear here.</div>';
    let submissions = '';
    if (isManager) {
      const mine = this.#quests.filter((quest) => quest.posted_by_id === this.#user.id);
      const mineIds = new Set(mine.map((quest) => quest.id));
      const pending = this.#acceptances.filter((row) => row.status === 'pending_review' && mineIds.has(row.quest_id));
      submissions = `<section class="panel"><div class="panel-header"><h2>Quest submissions to review</h2><span class="tag">${pending.length} pending</span></div>${pending.length ? pending.map((row) => this.#submissionCard(row, mine.find((quest) => quest.id === row.quest_id))).join('') : '<div class="panel-body"><div class="empty-state"><strong>All caught up</strong>Submissions for quests you created will appear here.</div></div>'}</section>`;
    }
    content.innerHTML = `${composer}<section><div class="panel-header" style="padding:0 0 14px;border:0;background:none"><h2>${isManager ? 'Published quests' : 'Available quests'}</h2><span class="tag">${this.#quests.length} total</span></div><div class="quest-grid">${questCards}</div></section>${submissions}`;
  }

  #questCard(quest) {
    const limit = Number(quest.acceptance_limit || 0);
    const occupied = this.#acceptances.filter((row) => row.quest_id === quest.id && row.status !== 'cancelled').length;
    const mine = this.#acceptances.find((row) => row.quest_id === quest.id && row.student_id === this.#user.id);
    const status = quest.status || 'open';
    let action = '';
    if (this.#role === 'student') {
      if (mine?.status === 'in_progress') {
        action = `<div class="form-field" style="margin-top:15px"><label for="proof-${escapeAttr(quest.id)}">Submit photo proof</label><input class="file-input" id="proof-${escapeAttr(quest.id)}" type="file" accept="image/*" data-proof-file="${escapeAttr(quest.id)}"><small class="form-hint">After submitting, staff or administration will review your proof.</small><div class="btn-row"><button class="btn btn-primary btn-small" data-action="submit-proof" data-id="${escapeAttr(quest.id)}" ${this.#proofFiles[quest.id] ? '' : 'disabled'}>Submit proof</button><button class="btn btn-secondary btn-small" data-action="cancel-quest" data-id="${escapeAttr(quest.id)}">Cancel quest</button></div></div>`;
      } else if (mine) {
        action = `<div class="btn-row"><span class="tag">${escapeHtml(this.#statusLabel(mine.status))}</span>${mine.photo_url ? `<a class="text-action" href="${escapeAttr(mine.photo_url)}" target="_blank" rel="noopener">View submitted proof ↗</a>` : ''}</div>`;
      } else if (status !== 'completed' && occupied < limit) {
        action = `<div class="btn-row"><button class="btn btn-primary btn-small" data-action="accept-quest" data-id="${escapeAttr(quest.id)}">Accept quest</button></div>`;
      } else {
        action = `<div class="btn-row"><span class="tag">${status === 'completed' ? 'Completed' : 'Full'}</span></div>`;
      }
    }
    return `<article class="quest-card"><div class="quest-top"><div><h3>${escapeHtml(quest.title || 'Untitled quest')}</h3><span class="form-hint">Posted by ${escapeHtml(quest.posted_by || 'Administration')}</span></div><span class="tag quest-status">${escapeHtml(this.#statusLabel(status))}</span></div><p>${escapeHtml(quest.description || '')}</p><div class="quest-stats"><span>✦ ${Number(quest.reward || 0)} SCpoints</span><span>◷ ${escapeHtml(quest.time_limit || 'No time limit')}</span><span>♙ ${occupied}/${limit || '∞'} accepted</span></div>${action}</article>`;
  }

  #submissionCard(row, quest) {
    const student = this.#students[row.student_id] || {};
    return `<div class="submission-card"><div class="submission-student"><strong>${escapeHtml(student.full_name || 'Student')}</strong><small>EDP: ${escapeHtml(student.edp_number || '—')} · ${escapeHtml(quest?.title || 'Quest')}</small></div><div class="submission-actions">${row.photo_url ? `<a class="btn btn-secondary btn-small" href="${escapeAttr(row.photo_url)}" target="_blank" rel="noopener">View proof ↗</a>` : '<span class="tag">No proof URL</span>'}<button class="btn btn-danger btn-small" data-action="reject-submission" data-id="${escapeAttr(row.id)}">Reject</button><button class="btn btn-success btn-small" data-action="approve-submission" data-id="${escapeAttr(row.id)}">Approve · +${Number(quest?.reward || 0)}</button></div></div>`;
  }

  #renderStaffRequests() {
    const content = document.getElementById('staffRequestsContent');
    if (!this.#staffRequests.length) {
      content.innerHTML = '<div class="empty-state"><strong>No pending staff requests</strong>New staff sign-ups submitted with EDP 000 will appear here.</div>';
      return;
    }
    content.innerHTML = `<section class="panel"><div class="panel-header"><h2>Pending approvals</h2><span class="tag">${this.#staffRequests.length} requests</span></div>${this.#staffRequests.map((person) => `<div class="staff-row"><div class="staff-info"><strong>${escapeHtml(person.full_name || 'Staff member')}</strong><small>${escapeHtml(person.email || 'No email')} · Requested ${escapeHtml(this.#formatDate(person.created_at))}</small></div><div class="staff-actions"><button class="btn btn-danger btn-small" data-action="staff-response" data-id="${escapeAttr(person.id)}" data-status="declined">Decline</button><button class="btn btn-primary btn-small" data-action="staff-response" data-id="${escapeAttr(person.id)}" data-status="approved">Approve</button></div></div>`).join('')}</section>`;
  }

  async #onClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === 'view') return this.#showView(button.dataset.view);
    if (action === 'announcement-filter') {
      this.#announcementFilter = button.dataset.filter;
      return this.#renderAnnouncements();
    }
    try {
      if (action === 'save-bio') await this.#saveBio();
      if (action === 'upload-photo') await this.#uploadProfilePhoto();
      if (action === 'bus-status') return;
      if (action === 'react') await this.#toggleReaction(id, button.dataset.reaction);
      if (action === 'delete-announcement') await this.#deleteAnnouncement(id);
      if (action === 'toggle-comments') {
        if (this.#expandedComments.has(id)) this.#expandedComments.delete(id);
        else this.#expandedComments.add(id);
        this.#renderAnnouncements();
      }
      if (action === 'accept-quest') await this.#acceptQuest(id);
      if (action === 'submit-proof') await this.#submitProof(id, button);
      if (action === 'cancel-quest') await this.#cancelQuest(id);
      if (action === 'approve-submission') await this.#reviewSubmission(id, true);
      if (action === 'reject-submission') await this.#reviewSubmission(id, false);
      if (action === 'staff-response') await this.#respondToStaff(id, button.dataset.status);
    } catch (error) {
      button.disabled = false;
      this.#notify(error.message || 'That action could not be completed.', 'error');
    }
  }

  async #onSubmit(event) {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const formType = form.dataset.form;
    const submit = form.querySelector('[type="submit"]');
    const errorBox = form.querySelector('[data-form-error]');
    if (errorBox) { errorBox.hidden = true; errorBox.textContent = ''; }
    if (submit) { submit.disabled = true; submit.dataset.originalLabel = submit.textContent; submit.textContent = 'Saving...'; }
    try {
      if (formType === 'announcement') await this.#createAnnouncement(form);
      if (formType === 'quest') await this.#createQuest(form);
      if (formType === 'comment') await this.#postComment(form);
      if (form.isConnected) form.reset();
    } catch (error) {
      if (errorBox) { errorBox.textContent = error.message || 'Could not save. Please try again.'; errorBox.hidden = false; }
      else this.#notify(error.message || 'Could not save. Please try again.', 'error');
    } finally {
      if (submit && submit.isConnected) { submit.disabled = false; submit.textContent = submit.dataset.originalLabel || 'Save'; }
    }
  }

  async #onChange(event) {
    const element = event.target;
    if (element.matches('[data-action="bus-status"]')) {
      try {
        const { error } = await this.#client.from('buses').update({ status: element.value, updated_at: new Date().toISOString() }).eq('id', element.dataset.id);
        if (error) throw error;
        await this.#refreshBuses();
        this.#notify('Bus status updated. Other connected users will see the change.', 'success');
      } catch (error) {
        this.#notify(error.message || 'Could not update the bus status.', 'error');
      }
    }
    if (element.matches('[data-proof-file]')) {
      const file = element.files?.[0];
      if (file) {
        this.#proofFiles[element.dataset.proofFile] = file;
        this.#renderQuests();
      }
    }
  }

  async #createAnnouncement(form) {
    if (!['admin', 'staff'].includes(this.#role)) throw new Error('You do not have permission to post announcements.');
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    const description = String(data.get('description') || '').trim();
    if (!title || !description) throw new Error('Please enter a title and description.');
    const image = data.get('image');
    let imageUrl = null;
    if (image instanceof File && image.size) {
      const ext = (image.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
      const path = `announcement_${Date.now()}.${ext}`;
      const { error } = await this.#client.storage.from('announcement-images').upload(path, image, { upsert: false });
      if (error) throw error;
      imageUrl = this.#client.storage.from('announcement-images').getPublicUrl(path).data.publicUrl;
    }
    let autoDeleteAt = null;
    if (data.get('autoDelete') === 'on') {
      const amount = Math.max(1, Number(data.get('expiryNumber') || 30));
      const unit = String(data.get('expiryUnit') || 'minutes');
      const multiplier = unit === 'days' ? 86400000 : unit === 'hours' ? 3600000 : 60000;
      autoDeleteAt = new Date(Date.now() + amount * multiplier).toISOString();
    }
    const { error } = await this.#client.from('announcements').insert({
      title, description, image_url: imageUrl, category: data.get('category') || 'news',
      posted_by: this.#displayName(), auto_delete_at: autoDeleteAt,
    });
    if (error) throw error;
    this.#notify('Announcement published to SCsystem.', 'success');
    await this.#refreshAnnouncements();
  }

  async #postComment(form) {
    const text = String(new FormData(form).get('comment') || '').trim();
    if (!text) return;
    const { error } = await this.#client.from('announcement_comments').insert({
      announcement_id: form.dataset.id,
      user_id: this.#user.id,
      author_name: this.#displayName(),
      comment_text: text,
    });
    if (error) throw error;
    this.#notify('Comment posted.', 'success');
    await this.#refreshAnnouncements();
  }

  async #toggleReaction(id, type) {
    const mine = this.#reactions.find((row) => row.announcement_id === id && row.user_id === this.#user.id);
    let result;
    if (mine?.reaction_type === type) {
      result = await this.#client.from('announcement_reactions').delete().eq('announcement_id', id).eq('user_id', this.#user.id);
    } else {
      result = await this.#client.from('announcement_reactions').upsert({ announcement_id: id, user_id: this.#user.id, reaction_type: type }, { onConflict: 'announcement_id,user_id' });
    }
    if (result.error) throw result.error;
    await this.#refreshAnnouncements();
  }

  async #deleteAnnouncement(id) {
    if (!['admin', 'staff'].includes(this.#role)) throw new Error('You do not have permission to delete announcements.');
    if (!confirm('Delete this announcement for everyone?')) return;
    const { error } = await this.#client.from('announcements').delete().eq('id', id);
    if (error) throw error;
    this.#notify('Announcement deleted.', 'success');
    await this.#refreshAnnouncements();
  }

  async #createQuest(form) {
    if (!['admin', 'staff'].includes(this.#role)) throw new Error('You do not have permission to create quests.');
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    const description = String(data.get('description') || '').trim();
    const reward = Number(data.get('reward'));
    const timeNumber = Number(data.get('timeNumber'));
    const acceptanceLimit = Number(data.get('acceptanceLimit'));
    if (!title || !description || !Number.isInteger(reward) || reward < 1 || !Number.isInteger(timeNumber) || timeNumber < 1 || !Number.isInteger(acceptanceLimit) || acceptanceLimit < 1) {
      throw new Error('Enter a title, description, and valid positive numbers for reward, time, and acceptance limit.');
    }
    const unit = String(data.get('timeUnit') || 'Minutes');
    const timeUnit = timeNumber === 1 ? unit.replace(/s$/, '') : unit;
    const { error } = await this.#client.from('quests').insert({
      title, description, reward, time_limit: `${timeNumber} ${timeUnit}`,
      acceptance_limit: acceptanceLimit, posted_by: this.#displayName(), posted_by_id: this.#user.id,
    });
    if (error) throw error;
    this.#notify('Quest created and shared with the mobile app.', 'success');
    await this.#refreshQuests();
  }

  async #acceptQuest(questId) {
    const quest = this.#quests.find((item) => item.id === questId);
    if (!quest) throw new Error('This quest is no longer available. Refresh and try again.');
    const occupied = this.#acceptances.filter((row) => row.quest_id === questId && row.status !== 'cancelled').length;
    if ((quest.status || 'open') === 'completed' || occupied >= Number(quest.acceptance_limit || 0)) throw new Error('This quest is full or has been completed.');
    const { error } = await this.#client.from('quest_acceptances').insert({ quest_id: questId, student_id: this.#user.id, status: 'in_progress' });
    if (error) throw error;
    this.#notify('Quest accepted. You can now submit photo proof.', 'success');
    await this.#refreshQuests();
  }

  async #submitProof(questId, button) {
    const file = this.#proofFiles[questId];
    if (!file) throw new Error('Choose a photo first.');
    const acceptance = this.#acceptances.find((row) => row.quest_id === questId && row.student_id === this.#user.id && row.status === 'in_progress');
    if (!acceptance) throw new Error('The active quest entry was not found. Refresh the page.');
    button.disabled = true;
    const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
    const path = `proof_${questId}_${Date.now()}.${ext}`;
    const { error: uploadError } = await this.#client.storage.from('quest-proofs').upload(path, file, { upsert: false });
    if (uploadError) throw uploadError;
    const photoUrl = this.#client.storage.from('quest-proofs').getPublicUrl(path).data.publicUrl;
    const { error } = await this.#client.from('quest_acceptances').update({
      photo_url: photoUrl, photo_path: path, status: 'pending_review', submitted_at: new Date().toISOString(),
    }).eq('id', acceptance.id);
    if (error) throw error;
    delete this.#proofFiles[questId];
    this.#notify('Photo proof submitted for review.', 'success');
    await this.#refreshQuests();
  }

  async #cancelQuest(questId) {
    const acceptance = this.#acceptances.find((row) => row.quest_id === questId && row.student_id === this.#user.id && row.status === 'in_progress');
    if (!acceptance) throw new Error('Active quest entry was not found.');
    if (!confirm('Cancel this quest?')) return;
    const { error } = await this.#client.from('quest_acceptances').update({ status: 'cancelled' }).eq('id', acceptance.id);
    if (error) throw error;
    delete this.#proofFiles[questId];
    await this.#refreshQuests();
  }

  async #reviewSubmission(acceptanceId, approve) {
    if (!['admin', 'staff'].includes(this.#role)) throw new Error('You do not have permission to review submissions.');
    const row = this.#acceptances.find((item) => item.id === acceptanceId && item.status === 'pending_review');
    if (!row) throw new Error('This submission has already been reviewed.');
    const quest = this.#quests.find((item) => item.id === row.quest_id);
    if (!quest) throw new Error('The linked quest was not found.');
    if (approve) {
      const rpc = this.#role === 'admin' ? 'award_points' : 'staff_reward_student';
      const params = this.#role === 'admin'
        ? { p_student_id: row.student_id, p_amount: quest.reward, p_reason: `Quest completed: ${quest.title}` }
        : { p_staff_id: this.#user.id, p_student_id: row.student_id, p_amount: quest.reward, p_reason: `Quest completed: ${quest.title}` };
      const { error: rewardError } = await this.#client.rpc(rpc, { ...params });
      if (rewardError) throw rewardError;
    }
    const { error } = await this.#client.from('quest_acceptances').update({ status: approve ? 'approved' : 'rejected', reviewed_at: new Date().toISOString() }).eq('id', row.id);
    if (error) throw error;
    const { error: recomputeError } = await this.#client.rpc('recompute_quest_completion', { p_quest_id: quest.id, p_acceptance_limit: quest.acceptance_limit });
    if (recomputeError) this.#notify('Submission was updated, but quest completion could not be recalculated.', 'error');
    else this.#notify(approve ? `Submission approved and ${quest.reward} SCpoints awarded.` : 'Submission rejected.', 'success');
    await Promise.all([this.#refreshQuests(), this.#refreshProfile()]);
    this.#renderProfile();
  }

  async #respondToStaff(id, status) {
    if (this.#role !== 'admin') throw new Error('Only administration can review staff requests.');
    const { error } = await this.#client.from('staff').update({ status }).eq('id', id);
    if (error) throw error;
    this.#notify(status === 'approved' ? 'Staff account approved.' : 'Staff request declined.', 'success');
    await this.#refreshStaffRequests();
  }

  async #saveBio() {
    if (this.#role !== 'student') throw new Error('Only student profiles support a bio.');
    const bio = document.getElementById('profileBio').value.trim();
    const { error } = await this.#client.from('students').update({ bio }).eq('id', this.#user.id);
    if (error) throw error;
    this.#account.profile.bio = bio;
    this.#notify('Bio saved.', 'success');
    this.#renderProfile();
  }

  async #uploadProfilePhoto() {
    if (this.#role !== 'student') throw new Error('Profile photos are managed from the student profile.');
    const input = document.getElementById('profilePhoto');
    const file = input.files?.[0];
    if (!file) throw new Error('Choose an image first.');
    const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
    const path = `profile_${this.#user.id}_${Date.now()}.${ext}`;
    const { error: uploadError } = await this.#client.storage.from('profile-photos').upload(path, file, { upsert: false });
    if (uploadError) throw uploadError;
    const url = this.#client.storage.from('profile-photos').getPublicUrl(path).data.publicUrl;
    const { error } = await this.#client.from('students').update({ profile_photo_url: url }).eq('id', this.#user.id);
    if (error) throw error;
    this.#account.profile.profile_photo_url = url;
    this.#notify('Profile photo updated.', 'success');
    this.#renderProfile();
    this.#setAvatar(document.getElementById('sideAvatar'), url, this.#displayName());
  }

  #visibleAnnouncements() {
    const now = Date.now();
    return this.#announcements.filter((item) => !item.auto_delete_at || new Date(item.auto_delete_at).getTime() > now);
  }

  #setAvatar(element, photo, name) {
    if (!element) return;
    element.innerHTML = photo ? `<img src="${escapeAttr(photo)}" alt="Profile photo">` : escapeHtml(this.#initials(name));
  }

  #profilePhoto() { return this.#account?.profile?.profile_photo_url || ''; }
  #displayName() { return this.#account?.profile?.full_name || (this.#role === 'admin' ? 'School Administration' : this.#user?.email || 'SCsystem user'); }
  #initials(name) { return String(name || 'SC').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'SC'; }

  #formatDate(value) {
    if (!value) return 'recently';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'recently';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  #busLabel(status) {
    return ({ going_to_main: 'Going to Main', going_to_buena: 'Going to Buena', on_break: 'On Break', waiting_in_main: 'Waiting in Main', waiting_in_buena: 'Waiting in Buena' })[status] || status.replaceAll('_', ' ');
  }

  #statusLabel(status) {
    return String(status || 'open').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  #notify(text, type = '') {
    const box = document.getElementById('flashMessage');
    box.textContent = text;
    box.className = `flash-message ${type}`.trim();
    box.hidden = false;
    clearTimeout(this.#notifyTimer);
    this.#notifyTimer = setTimeout(() => { box.hidden = true; }, 5000);
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttr(value) { return escapeHtml(value); }

new DashboardApp().start();
