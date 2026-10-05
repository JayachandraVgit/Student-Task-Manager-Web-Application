// Date and time helpers. Dates are "YYYY-MM-DD" strings in the user's local
// time zone; times are "HH:MM" (24-hour) strings.

const pad = (n) => String(n).padStart(2, '0');

export function toISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
}

export function addDays(iso, days) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function formatLongDate(iso) {
  return parseISODate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatShortDate(iso) {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatWeekday(iso) {
  return parseISODate(iso).toLocaleDateString('en-US', { weekday: 'long' });
}

export function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total) {
  const minutes = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
