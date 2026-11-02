import { formatName } from './Name.js';
export { formatName };


const item = (id, label) => ({ id, label });

export class User {
  #id;
  #fullName;
  #email;
  #scPoints;

  constructor({ id, fullName, email, scPoints }) {
    this.#id = id;
    this.#fullName = fullName ?? '';
    this.#email = email ?? '';
    this.#scPoints = scPoints ?? 0;
  }

  get id() { return this.#id; }
  get fullName() { return this.#fullName; }
  get email() { return this.#email; }
  get scPoints() { return this.#scPoints; }
  set scPoints(value) { if (Number.isFinite(value) && value >= 0) this.#scPoints = value; }
  get roleLabel() { return 'User'; }
  get postedByName() { return this.#fullName; }
  get isActive() { return true; }
  get canPost() { return false; }
  get isAdmin() { return false; }
  get hasProfileEditor() { return false; }
  get maxSendable() { return this.#scPoints; }
  get sendLabel() { return 'Send Points'; }
  navItems() { return []; }
  profileRows() { return [['Email', this.#email], ['SCpoints', String(this.#scPoints)]]; }
  async refreshPoints() {}
  async sendPoints() { throw new Error('This account cannot send points.'); }
}

export class Student extends User {
  #edpNumber;
  #course;
  #bio;
  #photoUrl;

  constructor(data) {
    super(data);
    this.#edpNumber = data.edpNumber ?? '';
    this.#course = data.course ?? '';
    this.#bio = data.bio ?? '';
    this.#photoUrl = data.photoUrl ?? null;
  }

  get edpNumber() { return this.#edpNumber; }
  get course() { return this.#course; }
  get bio() { return this.#bio; }
  get photoUrl() { return this.#photoUrl; }
  set bio(value) { this.#bio = String(value ?? '').trim().slice(0, 1000); }
  set photoUrl(value) { this.#photoUrl = value; }
  get roleLabel() { return 'Student'; }
  get hasProfileEditor() { return true; }

  navItems() {
    return [item('home', 'Home'), item('announcements', 'Announcements'), item('quests', 'Quests'), item('buses', 'Buses'), item('points', 'Points History'), item('send', 'Send Points')];
  }

  profileRows() {
    return [['EDP Number', this.#edpNumber], ['Course', this.#course || 'Not set'], ['Email', this.email], ['SCpoints', String(this.scPoints)]];
  }

  async refreshPoints(db) {
    const { data, error } = await db.from('students').select('sc_points').eq('id', this.id).maybeSingle();
    if (error) throw error;
    if (data) this.scPoints = data.sc_points ?? 0;
  }

  async sendPoints(db, targetId, amount, reason) {
    const { error } = await db.rpc('transfer_points', { p_from_id: this.id, p_to_id: targetId, p_amount: amount, p_reason: reason });
    if (error) throw error;
  }
}

export class Staff extends User {
  #status;

  constructor(data) {
    super(data);
    this.#status = data.status ?? 'pending';
  }

  get status() { return this.#status; }
  get roleLabel() { return 'Teacher'; }
  get isActive() { return this.#status === 'approved'; }
  get canPost() { return true; }
  get sendLabel() { return 'Reward Students'; }

  navItems() {
    return [item('home', 'Home'), item('announcements', 'Announcements'), item('manage', 'Manage Quests'), item('activity', 'Quest Activity'), item('buscontrol', 'Bus Control'), item('points', 'Points History'), item('send', 'Reward Students')];
  }

  async refreshPoints(db) {
    const { data, error } = await db.from('staff').select('sc_points').eq('id', this.id).maybeSingle();
    if (error) throw error;
    if (data) this.scPoints = data.sc_points ?? 0;
  }

  async sendPoints(db, targetId, amount, reason) {
    const { error } = await db.rpc('staff_reward_student', { p_staff_id: this.id, p_student_id: targetId, p_amount: amount, p_reason: reason });
    if (error) throw error;
  }
}

export class Admin extends User {
  get roleLabel() { return 'Administrator'; }
  get postedByName() { return 'Administration'; }
  get canPost() { return true; }
  get isAdmin() { return true; }
  get maxSendable() { return Infinity; }
  get sendLabel() { return 'Award Points'; }
  navItems() { return [item('home', 'Home'), item('requests', 'Teacher Requests'), item('distribute', 'Distribute Points'), item('distlog', 'Distribution History'), item('announcements', 'Announcements'), item('manage', 'Manage Quests'), item('activity', 'Quest Activity'), item('buscontrol', 'Bus Control'), item('send', 'Award Points')]; }
  profileRows() { return [['Email', this.email]]; }
  async sendPoints(db, targetId, amount, reason) {
    const { error } = await db.rpc('award_points', { p_student_id: targetId, p_amount: amount, p_reason: reason });
    if (error) throw error;
  }
}
