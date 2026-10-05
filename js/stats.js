// Pure functions that derive everything shown on the dashboard from the
// task list, so counters can never drift from the real data.

import { timeToMinutes } from './dates.js';

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

export const FILTERS = ['all', 'deep', 'shallow', 'pending', 'completed'];

export function tasksForDate(tasks, date) {
  return tasks.filter((t) => t.date === date);
}

function group(tasks, type) {
  const items = tasks.filter((t) => t.type === type);
  return {
    count: items.length,
    done: items.filter((t) => t.completed).length,
    minutes: items.reduce((sum, t) => sum + t.duration, 0),
  };
}

/**
 * @param {object[]} tasks     every task from the backend
 * @param {string} viewDate    the day shown on the dashboard
 * @param {string} today       the real current date
 */
export function computeSummary(tasks, viewDate, today) {
  const day = tasksForDate(tasks, viewDate);
  const open = tasks.filter((t) => !t.completed);
  const completed = day.filter((t) => t.completed).length;
  const total = day.length;
  return {
    pendingAll: open.length,
    overdue: open.filter((t) => t.date < today).length,
    total,
    completed,
    remaining: total - completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    deep: group(day, 'deep'),
    shallow: group(day, 'shallow'),
  };
}

export function progressMessage({ total, completed, percent }) {
  if (total === 0) return 'Nothing scheduled yet. Add a task to plan your day.';
  if (completed === total) return 'All done. Nice work.';
  if (percent === 0) return 'Pick one task and get started.';
  if (percent < 50) return 'A good start. Keep going.';
  return "You're making progress!";
}

export function greeting(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const timeKey = (t) => (t.time ? timeToMinutes(t.time) : Infinity);

/** Deep work first, then open before done, then priority, then scheduled time. */
export function sortTasks(tasks) {
  return [...tasks].sort(
    (a, b) =>
      (a.type === b.type ? 0 : a.type === 'deep' ? -1 : 1) ||
      Number(a.completed) - Number(b.completed) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (timeKey(a) === timeKey(b) ? 0 : timeKey(a) < timeKey(b) ? -1 : 1) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export function applyFilter(tasks, filter) {
  switch (filter) {
    case 'deep':
      return tasks.filter((t) => t.type === 'deep');
    case 'shallow':
      return tasks.filter((t) => t.type === 'shallow');
    case 'pending':
      return tasks.filter((t) => !t.completed);
    case 'completed':
      return tasks.filter((t) => t.completed);
    default:
      return tasks;
  }
}

/** Split a day's tasks into time-ordered events and unscheduled tasks. */
export function buildTimeline(tasks) {
  const scheduled = tasks
    .filter((t) => t.time)
    .map((task) => {
      const start = timeToMinutes(task.time);
      return { task, start, end: start + task.duration };
    })
    .sort((a, b) => a.start - b.start || (a.task.type === b.task.type ? 0 : a.task.type === 'deep' ? -1 : 1));
  const unscheduled = sortTasks(tasks.filter((t) => !t.time));
  return { scheduled, unscheduled };
}
