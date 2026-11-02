import { ThemeManager } from './ThemeManager.js';
import { SupabaseService } from './SupabaseService.js';
import { AuthService } from './AuthService.js';
import { LoginForm } from './LoginForm.js';

new ThemeManager().attachTo(document.getElementById('themeToggle'));

const auth = new AuthService(new SupabaseService());
if (await auth.hasSession()) location.replace('app.html');
new LoginForm(document.getElementById('loginForm'), auth);
