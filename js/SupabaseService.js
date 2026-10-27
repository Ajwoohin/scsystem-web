import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.104.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// A class is a blueprint. This one is the ONLY place that talks to Supabase.
export class SupabaseService {
  // The # makes this field private (encapsulation).
  // Nothing outside this class can touch it directly.
  #client;

  constructor() {
    this.#client = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  // A getter: other files can read the client, but cannot replace it.
  get client() {
    return this.#client;
  }

  // A method: asks Supabase one simple question to see if it answers.
  async testConnection() {
    try {
      const { data, error } = await this.#client.from('buses').select('*').limit(1);

      if (error) {
        // 42501 = "permission denied". Supabase still answered, so we ARE connected.
        if (error.code === '42501') {
          return { ok: true, message: 'Connected! Supabase answered and blocked us because we are not logged in. Your rules work.' };
        }
        return { ok: false, message: 'Problem: ' + error.message };
      }

      return { ok: true, message: 'Connected! Supabase answered with ' + data.length + ' rows (0 is normal when logged out).' };
    } catch (err) {
      return { ok: false, message: 'Could not reach Supabase: ' + err.message };
    }
  }
}