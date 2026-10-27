import { SupabaseService } from './SupabaseService.js';

const statusEl = document.getElementById('status');
const service = new SupabaseService();

async function run() {
  const result = await service.testConnection();
  statusEl.textContent = result.message;
  statusEl.className = result.ok ? 'ok' : 'bad';
}

run();