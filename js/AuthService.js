// Handles accounts. It uses SupabaseService (composition) and never touches the page.
export class AuthService {
  #supabase;

  constructor(supabaseService) {
    this.#supabase = supabaseService;
  }

  // Same signUp call as the Android app. The database trigger then creates
  // the student profile row from the "data" we send here.
  async signUpStudent({ fullName, edpNumber, email, password }) {
    try {
      const { data, error } = await this.#supabase.client.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            edp_number: edpNumber,
            role: 'student',
          },
        },
      });

      if (error) {
        return { ok: false, message: AuthService.#friendlyMessage(error) };
      }

      // When an email is already registered, Supabase answers with a user that
      // has no identities instead of an error.
      const identities = data.user?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        return { ok: false, message: 'This email is already registered. Try logging in instead.' };
      }

      // No session yet means the email still has to be confirmed.
      return { ok: true, needsVerification: data.session === null };
    } catch (err) {
      return { ok: false, message: 'Could not reach the server. Check your internet and try again.' };
    }
  }

  static #friendlyMessage(error) {
    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      return 'Too many sign-up emails were sent. Please wait a few minutes and try again.';
    }
    if (error.code === 'weak_password') {
      return 'That password is too weak. Try a longer one.';
    }
    if (error.code === 'user_already_exists' || error.code === 'email_exists') {
      return 'This email is already registered. Try logging in instead.';
    }
    if (error.name === 'AuthRetryableFetchError') {
      return 'Could not reach the server. Check your internet and try again.';
    }
    return error.message || 'Something went wrong. Please try again.';
  }
}
