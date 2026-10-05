'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = (f) => import(`../js/${f}.js`);

const task = (o) => ({ id: Math.random().toString(), title: 't', description: '', type: 'deep', priority: 'medium', duration: 30, time: null, date: '2026-10-02', completed: false, createdAt: '2026-10-01T00:00:00Z', ...o });

test('summary counters and progress come from task data', async () => {
  const { computeSummary, progressMessage } = await load('stats');
  const tasks = [
    task({ type: 'deep', duration: 50, completed: true }),
    task({ type: 'deep', duration: 40 }),
    task({ type: 'shallow', duration: 5 }),
    task({ date: '2026-10-05' }),               // other day, still pending
    task({ date: '2026-10-01' }),               // overdue
  ];
  const s = computeSummary(tasks, '2026-10-02', '2026-10-02');
  assert.equal(s.total, 3);
  assert.equal(s.completed, 1);
  assert.equal(s.remaining, 2);
  assert.equal(s.percent, 33);
  assert.equal(s.pendingAll, 4);
  assert.equal(s.overdue, 1);
  assert.deepEqual(s.deep, { count: 2, done: 1, minutes: 90 });
  assert.deepEqual(s.shallow, { count: 1, done: 0, minutes: 5 });
  assert.equal(progressMessage(s), 'A good start. Keep going.');
});

test('no tasks does not divide by zero', async () => {
  const { computeSummary, progressMessage } = await load('stats');
  const s = computeSummary([], '2026-10-02', '2026-10-02');
  assert.equal(s.percent, 0);
  assert.ok(!Number.isNaN(s.percent));
  assert.match(progressMessage(s), /Nothing scheduled/);
});

test('deep work sorts before shallow, then open, priority, time', async () => {
  const { sortTasks } = await load('stats');
  const out = sortTasks([
    task({ title: 'shallow-high', type: 'shallow', priority: 'high' }),
    task({ title: 'deep-done', completed: true, priority: 'high' }),
    task({ title: 'deep-low', priority: 'low' }),
    task({ title: 'deep-high-late', priority: 'high', time: '18:00' }),
    task({ title: 'deep-high-early', priority: 'high', time: '09:00' }),
    task({ title: 'deep-high-none', priority: 'high' }),
  ]).map((t) => t.title);
  assert.deepEqual(out, ['deep-high-early', 'deep-high-late', 'deep-high-none', 'deep-low', 'deep-done', 'shallow-high']);
});

test('filters return the right subsets', async () => {
  const { applyFilter } = await load('stats');
  const tasks = [task({ type: 'deep' }), task({ type: 'shallow', completed: true }), task({ type: 'shallow' })];
  assert.equal(applyFilter(tasks, 'all').length, 3);
  assert.equal(applyFilter(tasks, 'deep').length, 1);
  assert.equal(applyFilter(tasks, 'shallow').length, 2);
  assert.equal(applyFilter(tasks, 'pending').length, 2);
  assert.equal(applyFilter(tasks, 'completed').length, 1);
});

test('timeline orders scheduled tasks and separates unscheduled', async () => {
  const { buildTimeline } = await load('stats');
  const { scheduled, unscheduled } = buildTimeline([
    task({ title: 'b', time: '13:30', duration: 30 }), task({ title: 'a', time: '09:00', duration: 90 }), task({ title: 'none' }),
  ]);
  assert.deepEqual(scheduled.map((e) => e.task.title), ['a', 'b']);
  assert.equal(scheduled[0].end, 9 * 60 + 90);
  assert.deepEqual(unscheduled.map((t) => t.title), ['none']);
});

test('date and duration formatting', async () => {
  const { addDays, formatDuration, minutesToTime, toISODate } = await load('dates');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(90), '1h 30m');
  assert.equal(formatDuration(120), '2h');
  assert.equal(minutesToTime(570), '09:30');
  assert.equal(minutesToTime(1500), '01:00');
  assert.match(toISODate(new Date(2026, 9, 2)), /^2026-10-02$/);
});

test('pomodoro start/pause/reset and focus -> break -> long break cycle', async () => {
  const { createPomodoro, formatClock } = await load('pomodoro');
  let t = 0;
  const done = [];
  const p = createPomodoro({ now: () => t, autoTick: false, onComplete: (e) => done.push(`${e.finished}>${e.next}`) });
  assert.equal(formatClock(p.state.remainingMs), '25:00');
  p.start(); t += 60_000; p.tick();
  assert.equal(formatClock(p.state.remainingMs), '24:00');
  p.pause(); t += 600_000; p.tick();
  assert.equal(formatClock(p.state.remainingMs), '24:00');       // paused time does not count
  p.start(); t += 24 * 60_000; p.tick();
  assert.deepEqual(done, ['focus>short']);
  assert.equal(p.state.mode, 'short');
  assert.equal(formatClock(p.state.remainingMs), '05:00');
  assert.equal(p.state.running, false);
  p.setMode('focus'); p.start(); t += 10_000; p.reset();
  assert.equal(formatClock(p.state.remainingMs), '25:00');
  assert.equal(p.state.running, false);
  for (let i = 0; i < 3; i++) { p.setMode('focus'); p.start(); t += 25 * 60_000; p.tick(); }
  assert.equal(p.state.mode, 'long');                            // 4th focus session -> long break
  assert.equal(p.state.completed, 4);
  p.start(); t += 15 * 60_000; p.tick();
  assert.equal(p.state.mode, 'focus');
  assert.equal(p.state.completed, 0);                            // new set
  assert.equal(done.at(-1), 'long>focus');
});
