import { ThemeManager } from './ThemeManager.js';
import { SupabaseService } from './SupabaseService.js';
import { AuthService } from './AuthService.js';
import { SignUpForm } from './SignUpForm.js';

const theme = new ThemeManager();
theme.attachTo(document.getElementById('themeToggle'));

const auth = new AuthService(new SupabaseService());
new SignUpForm(document.getElementById('signUpForm'), auth);
