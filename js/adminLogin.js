import { ThemeManager } from './ThemeManager.js';
import { SupabaseService } from './SupabaseService.js';
import { AuthService } from './AuthService.js';
import { AdminLoginForm } from './LoginForm.js';

new ThemeManager().attachTo(document.getElementById('themeToggle'));

const auth = new AuthService(new SupabaseService());
if (await auth.hasSession()) location.replace('app.html');
new AdminLoginForm(document.getElementById('loginForm'), auth);
