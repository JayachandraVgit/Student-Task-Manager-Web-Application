'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { start } = require('../server.js');

let ctx, base, dataFile;

before(async () => {
  dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stm-')), 'tasks.json');
  ctx = await start({ port: 0, dataFile });
  base = `http://127.0.0.1:${ctx.server.address().port}`;
});
after(() => ctx.server.close());

const call = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const valid = { title: 'Finish calculus', type: 'deep', priority: 'high', duration: 50, time: '17:00', date: '2026-10-02' };

test('rejects invalid input with per-field messages', async () => {
  const r = await call('POST', '/api/tasks', { title: '  ', type: 'x', priority: 'urgent', duration: 0, time: '25:00', date: '2026-02-30' });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.body.fields).sort(), ['date', 'duration', 'priority', 'time', 'title', 'type']);
});

test('creates, lists by date, and persists priority/duration/time', async () => {
  const created = await call('POST', '/api/tasks', valid);
  assert.equal(created.status, 201);
  assert.equal(created.body.task.priority, 'high');
  assert.equal(created.body.task.duration, 50);
  assert.equal(created.body.task.completed, false);
  await call('POST', '/api/tasks', { ...valid, title: 'Other day', date: '2026-10-03', type: 'shallow', time: '' });
  const day = await call('GET', '/api/tasks?date=2026-10-02');
  assert.equal(day.body.tasks.length, 1);
  assert.equal((await call('GET', '/api/tasks')).body.tasks.length, 2);
  assert.equal((await call('GET', '/api/tasks?date=nope')).status, 400);
});

test('patch toggles completion and sets completedAt', async () => {
  const { task } = (await call('POST', '/api/tasks', valid)).body;
  const done = await call('PATCH', `/api/tasks/${task.id}`, { completed: true });
  assert.equal(done.body.task.completed, true);
  assert.ok(done.body.task.completedAt);
  const reopened = await call('PATCH', `/api/tasks/${task.id}`, { completed: false });
  assert.equal(reopened.body.task.completedAt, null);
  const edited = await call('PATCH', `/api/tasks/${task.id}`, { title: 'Renamed', time: null });
  assert.equal(edited.body.task.title, 'Renamed');
  assert.equal(edited.body.task.time, null);
  assert.equal((await call('PATCH', `/api/tasks/${task.id}`, { duration: 9999 })).status, 400);
});

test('delete removes the task; unknown ids return 404', async () => {
  const { task } = (await call('POST', '/api/tasks', valid)).body;
  assert.equal((await call('DELETE', `/api/tasks/${task.id}`)).status, 200);
  assert.equal((await call('GET', `/api/tasks/${task.id}`)).status, 404);
  assert.equal((await call('DELETE', `/api/tasks/${task.id}`)).status, 404);
  assert.equal((await call('PATCH', '/api/tasks/missing', { completed: true })).status, 404);
});

test('rejects malformed and oversized bodies', async () => {
  const bad = await fetch(base + '/api/tasks', { method: 'POST', body: '{nope' });
  assert.equal(bad.status, 400);
  const big = await fetch(base + '/api/tasks', { method: 'POST', body: JSON.stringify({ title: 'x'.repeat(200 * 1024) }) }).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);
});

test('data survives a server restart', async () => {
  const before = (await call('GET', '/api/tasks')).body.tasks.length;
  const second = await start({ port: 0, dataFile });
  const res = await fetch(`http://127.0.0.1:${second.server.address().port}/api/tasks`);
  assert.equal((await res.json()).tasks.length, before);
  second.server.close();
});

test('serves only the frontend files', async () => {
  for (const ok of ['/', '/style.css', '/script.js', '/js/stats.js']) {
    assert.equal((await fetch(base + ok)).status, 200, ok);
  }
  for (const hidden of ['/server.js', '/package.json', '/data/tasks.json', '/js/package.json', '/README.md']) {
    assert.equal((await fetch(base + hidden)).status, 404, hidden);
  }
  // Raw request so the client cannot normalise the path away.
  const status = await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: ctx.server.address().port, path: '/js/../server.js', method: 'GET' }, (r) => { r.resume(); resolve(r.statusCode); });
    req.end();
  });
  assert.equal(status, 404);
});
