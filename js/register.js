import { ThemeManager } from './ThemeManager.js';
import { SupabaseService } from './SupabaseService.js';
import { AuthService } from './AuthService.js';
import { SignUpForm } from './SignUpForm.js';

new ThemeManager().attachTo(document.getElementById('themeToggle'));
const service = new SupabaseService();
new SignUpForm(document.getElementById('signUpForm'), new AuthService(service));
