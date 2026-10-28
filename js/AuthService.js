export class AuthService {
  #supabase;

  constructor(supabaseService) {
    this.#supabase = supabaseService;
  }

  get client() {
    return this.#supabase.client;
  }

  async signUpStudent({ fullName, edpNumber, email, password }) {
    try {
      const isStaff = edpNumber === '000';
      const metadata = isStaff
        ? { full_name: fullName, role: 'staff' }
        : { full_name: fullName, edp_number: edpNumber, role: 'student' };

      const { data, error } = await this.client.auth.signUp({
        email,
        password,
        options: { data: metadata },
      });

      if (error) return { ok: false, message: AuthService.#friendlyMessage(error) };
      if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
        return { ok: false, message: 'This email is already registered. Try logging in instead.' };
      }
      if (!data.user) return { ok: false, message: 'Account creation failed. Please try again.' };

      return { ok: true, isStaff, needsVerification: data.session === null };
    } catch (_) {
      return { ok: false, message: 'Could not reach the server. Check your internet and try again.' };
    }
  }

  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(AuthService.#friendlyMessage(error));
    return data.user;
  }

  async getAccount(user) {
    if (!user) throw new Error('Please log in to continue.');

    if ((user.email || '').toLowerCase() === AuthService.ADMIN_EMAIL.toLowerCase()) {
      return { role: 'admin', status: 'approved', profile: { full_name: 'School Administration', email: user.email, sc_points: 0 } };
    }

    const { data: staff, error: staffError } = await this.client
      .from('staff').select('*').eq('id', user.id).maybeSingle();
    if (staffError) throw new Error(staffError.message);
    if (staff) return { role: 'staff', status: staff.status || 'pending', profile: staff };

    const { data: student, error: studentError } = await this.client
      .from('students').select('*').eq('id', user.id).maybeSingle();
    if (studentError) throw new Error(studentError.message);
    if (student) return { role: 'student', status: 'approved', profile: student };

    throw new Error('Your profile was not found. Please contact the SCsystem administrator.');
  }

  async signOut() {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  static ADMIN_EMAIL = 'Administration@Adming.sccpag.edu.ph';

  static #friendlyMessage(error) {
    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      return 'Too many requests were sent. Please wait a few minutes and try again.';
    }
    if (error.code === 'weak_password') return 'That password is too weak. Try a longer one.';
    if (['user_already_exists', 'email_exists'].includes(error.code)) {
      return 'This email is already registered. Try logging in instead.';
    }
    if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
      return 'Could not reach the server. Check your internet and try again.';
    }
    if (error.message?.toLowerCase().includes('invalid login credentials')) {
      return 'The email or password is incorrect.';
    }
    return error.message || 'Something went wrong. Please try again.';
  }
}
