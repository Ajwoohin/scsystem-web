import { ThemeManager } from './ThemeManager.js';
import { CopyrightModal } from './CopyrightModal.js';

const theme = new ThemeManager();
theme.attachTo(document.getElementById('themeToggle'));

const copyright = new CopyrightModal('copyrightDialog');
document.getElementById('copyrightBtn').addEventListener('click', () => copyright.open());
