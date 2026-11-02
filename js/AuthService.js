import { Student, Staff, Admin, formatName } from './User.js';

export class AuthService {
  #supabase;

  constructor(supabaseService) {
    this.#supabase = supabaseService;
  }

  get #auth() {
    return this.#supabase.client.auth;
  }

  signUpStudent({ firstName, middleName, lastName, course, edpNumber, email, password }) {
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
    return this.#signUp(email, password, {
      role: 'student', full_name: fullName, first_name: firstName,
      middle_name: middleName || null, last_name: lastName, course, edp_number: edpNumber,
    });
  }

  signUpStaff({ firstName, middleName, lastName, email, password }) {
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
    return this.#signUp(email, password, {
      role: 'staff', full_name: fullName, first_name: firstName,
      middle_name: middleName || null, last_name: lastName,
    });
  }

  async #signUp(email, password, metadata) {
    try {
      const { data, error } = await this.#auth.signUp({
        email,
        password,
        options: { data: metadata },
      });
      if (error) return { ok: false, message: AuthService.#friendlyMessage(error) };
      if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
        return { ok: false, message: 'This email is already registered. Try logging in instead.' };
      }
      if (!data.user) return { ok: false, message: 'Account creation failed. Please try again.' };
      return { ok: true, needsVerification: data.session === null };
    } catch (error) {
      return { ok: false, message: AuthService.#friendlyMessage(error) };
    }
  }

  async signIn(email, password) {
    try {
      const { error } = await this.#auth.signInWithPassword({ email, password });
      if (error) return { ok: false, message: AuthService.#friendlyMessage(error) };
      return { ok: true };
    } catch (error) {
      return { ok: false, message: AuthService.#friendlyMessage(error) };
    }
  }

  async signInAdmin(email, password) {
    const result = await this.signIn(email, password);
    if (!result.ok) return result;
    try {
      const user = await this.loadUser();
      if (user?.isAdmin) return { ok: true };
    } catch (error) {
      await this.signOut().catch(() => {});
      return { ok: false, message: error.message || 'Could not verify this administrator account.' };
    }
    await this.signOut();
    return { ok: false, message: 'This account is not an administrator account.' };
  }

  async signOut() {
    const { error } = await this.#auth.signOut();
    if (error) throw error;
  }

  async hasSession() {
    const { data, error } = await this.#auth.getSession();
    if (error) throw error;
    return Boolean(data.session);
  }

  async loadUser() {
    const { data, error } = await this.#auth.getSession();
    if (error) throw error;
    const authUser = data.session?.user;
    if (!authUser) return null;

    const db = this.#supabase.client;
    const studentResult = await db.from('students').select('*').eq('id', authUser.id).maybeSingle();
    if (studentResult.error) throw studentResult.error;
    const student = studentResult.data;

    if (student?.is_admin) {
      return new Admin({ id: authUser.id, fullName: formatName(student), email: authUser.email });
    }
    if (student) {
      return new Student({
        id: authUser.id,
        fullName: formatName(student),
        firstName: student.first_name,
        middleName: student.middle_name,
        lastName: student.last_name,
        course: student.course,
        email: student.institutional_email ?? authUser.email,
        scPoints: student.sc_points,
        edpNumber: student.edp_number,
        bio: student.bio,
        photoUrl: student.profile_photo_url,
      });
    }

    const staffResult = await db.from('staff').select('*').eq('id', authUser.id).maybeSingle();
    if (staffResult.error) throw staffResult.error;
    const staff = staffResult.data;
    if (staff) {
      return new Staff({
        id: authUser.id,
        fullName: formatName(staff),
        firstName: staff.first_name,
        middleName: staff.middle_name,
        lastName: staff.last_name,
        email: staff.email ?? authUser.email,
        scPoints: staff.sc_points,
        status: staff.status,
      });
    }
    return null;
  }

  static #friendlyMessage(error) {
    const detail = String(error?.message || '');
    if (error?.code === '23505' && /edp_number|students_edp/i.test(detail)) return 'That EDP number is already registered. Please check the number and try again.';
    if (error?.status === 429 || error?.code === 'over_email_send_rate_limit') return 'Too many requests were sent. Please wait a few minutes and try again.';
    if (error?.code === 'weak_password') return 'That password is too weak. Try a longer one.';
    if (['user_already_exists', 'email_exists'].includes(error?.code)) return 'This email is already registered. Try logging in instead.';
    if (error?.code === 'email_not_confirmed') return 'Please confirm your email first. Check your inbox.';
    if (error?.code === 'invalid_credentials') return 'The email or password is incorrect.';
    if (error?.name === 'AuthRetryableFetchError' || error?.status === 0) return 'Could not reach the server. Check your internet and try again.';
    return error?.message || 'Something went wrong. Please try again.';
  }
}
