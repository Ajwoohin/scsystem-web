export function formatName(profile = {}) {
  const parts = [profile.first_name, profile.middle_name, profile.last_name]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  return parts.join(' ') || String(profile.full_name ?? '').trim() || 'Unknown';
}
