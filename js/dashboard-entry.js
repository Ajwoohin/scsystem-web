import { SupabaseService } from './SupabaseService.js';
import { AuthService } from './AuthService.js';
import { App } from './DashboardApp.js';


const supabase = new SupabaseService();
new App({ supabase, auth: new AuthService(supabase) }).start();
