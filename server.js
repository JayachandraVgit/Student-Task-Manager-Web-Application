'use strict';

/**
 * Student Task Manager - backend
 *
 * A small, dependency-free Node.js server that:
 *   1. exposes a JSON REST API under /api/tasks
 *   2. serves the single-page frontend (index.html, style.css, script.js, js/*.js)
 *   3. persists tasks to a JSON file (data/tasks.json by default)
 *
 * Run:  npm start        (http://localhost:3000)
 * Test: npm test
 */

const http = require('node:http');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const MAX_BODY_BYTES = 100 * 1024;

const TASK_TYPES = ['deep', 'shallow'];
const PRIORITIES = ['high', 'medium', 'low'];

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validate and normalise task input.
 * @param {object} input   parsed JSON body
 * @param {{partial: boolean}} opts  partial=true for PATCH (only validate provided fields)
 * @returns {{value: object, fields: Record<string,string>}}
 */
function validateTaskInput(input, { partial }) {
  const fields = {};
  const value = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);

  if (!partial || has('title')) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) fields.title = 'Task name is required.';
    else if (title.length > 120) fields.title = 'Task name must be 120 characters or fewer.';
    else value.title = title;
  }

  if (has('description') && input.description !== null) {
    if (typeof input.description !== 'string') fields.description = 'Description must be text.';
    else if (input.description.trim().length > 500) fields.description = 'Description must be 500 characters or fewer.';
    else value.description = input.description.trim();
  } else if (has('description') || !partial) {
    value.description = '';
  }

  if (!partial || has('type')) {
    if (!TASK_TYPES.includes(input.type)) fields.type = 'Choose deep work or shallow work.';
    else value.type = input.type;
  }

  if (has('priority') || !partial) {
    const priority = has('priority') ? input.priority : 'medium';
    if (!PRIORITIES.includes(priority)) fields.priority = 'Choose high, medium or low priority.';
    else value.priority = priority;
  }

  if (has('duration') || !partial) {
    const duration = has('duration') ? input.duration : 25;
    if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
      fields.duration = 'Enter a duration between 1 and 600 minutes.';
    } else value.duration = duration;
  }

  if (has('time') || !partial) {
    const time = has('time') ? input.time : null;
    if (time === null || time === '' || time === undefined) value.time = null;
    else if (typeof time !== 'string' || !TIME_RE.test(time)) fields.time = 'Use a 24-hour time such as 14:30.';
    else value.time = time;
  }

  if (!partial || has('date')) {
    if (!isValidISODate(input.date)) fields.date = 'Choose a valid date.';
    else value.date = input.date;
  }

  if (has('completed')) {
    if (typeof input.completed !== 'boolean') fields.completed = 'Completed must be true or false.';
    else value.completed = input.completed;
  }

  return { value, fields };
}

/* ------------------------------------------------------------------ */
/* Storage (JSON file, serialised writes, atomic replace)              */
/* ------------------------------------------------------------------ */

class TaskStore {
  constructor(file) {
    this.file = file;
    this.tasks = [];
    this.queue = Promise.resolve();
  }

  async init() {
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    let raw;
    try {
      raw = await fsp.readFile(this.file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        await this._write([]);
        return;
      }
      throw err;
    }
    try {
      const parsed = JSON.parse(raw);
      const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
      if (!Array.isArray(tasks)) throw new Error('Unexpected file format');
      this.tasks = tasks;
    } catch (err) {
      // Never silently destroy the user's data: keep the unreadable file aside.
      const backup = `${this.file}.corrupt-${Date.now()}`;
      await fsp.rename(this.file, backup);
      console.error(`Could not read ${this.file} (${err.message}). Moved it to ${backup} and started empty.`);
      this.tasks = [];
      await this._write([]);
    }
  }

  async _write(tasks) {
    const tmp = `${this.file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify({ version: 1, tasks }, null, 2));
    await fsp.rename(tmp, this.file);
  }

  /**
   * Run a mutation after every earlier one has finished. `fn` receives the
   * committed task array and returns { tasks, result }. Memory is only updated
   * once the file write has succeeded, so a failed write never leaves the
   * server and disk disagreeing.
   */
  _mutate(fn) {
    const run = this.queue.catch(() => {}).then(async () => {
      const { tasks, result } = fn(this.tasks);
      await this._write(tasks);
      this.tasks = tasks;
      return result;
    });
    this.queue = run;
    return run;
  }

  list({ date } = {}) {
    return date ? this.tasks.filter((t) => t.date === date) : [...this.tasks];
  }

  get(id) {
    return this.tasks.find((t) => t.id === id) || null;
  }

  create(input) {
    return this._mutate((tasks) => {
      const now = new Date().toISOString();
      const completed = input.completed === true;
      const task = {
        id: crypto.randomUUID(),
        title: input.title,
        description: input.description,
        type: input.type,
        priority: input.priority,
        duration: input.duration,
        time: input.time,
        date: input.date,
        completed,
        completedAt: completed ? now : null,
        createdAt: now,
        updatedAt: now,
      };
      return { tasks: [...tasks, task], result: task };
    });
  }

  update(id, patch) {
    return this._mutate((tasks) => {
      const index = tasks.findIndex((t) => t.id === id);
      if (index === -1) throw new HttpError(404, 'Task not found.');
      const now = new Date().toISOString();
      const merged = { ...tasks[index], ...patch, updatedAt: now };
      if (Object.prototype.hasOwnProperty.call(patch, 'completed')) {
        if (patch.completed && !tasks[index].completed) merged.completedAt = now;
        if (!patch.completed) merged.completedAt = null;
      }
      const next = [...tasks];
      next[index] = merged;
      return { tasks: next, result: merged };
    });
  }

  remove(id) {
    return this._mutate((tasks) => {
      if (!tasks.some((t) => t.id === id)) throw new HttpError(404, 'Task not found.');
      return { tasks: tasks.filter((t) => t.id !== id), result: null };
    });
  }
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        resolve(parsed);
      } catch {
        reject(new HttpError(400, 'Request body must be a JSON object.'));
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ */
/* API routes                                                          */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, store, url) {
  if (url.pathname === '/api/health') {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    return sendJson(res, 200, { status: 'ok' });
  }

  const match = url.pathname.match(/^\/api\/tasks(?:\/([^/]+))?\/?$/);
  if (!match) throw new HttpError(404, 'Not found.');
  const id = match[1];

  if (!id) {
    if (req.method === 'GET') {
      const date = url.searchParams.get('date');
      if (date !== null && !isValidISODate(date)) {
        throw new HttpError(400, 'Invalid date.', { date: 'Use the format YYYY-MM-DD.' });
      }
      return sendJson(res, 200, { tasks: store.list({ date: date || undefined }) });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const { value, fields } = validateTaskInput(body, { partial: false });
      if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', fields);
      return sendJson(res, 201, { task: await store.create(value) });
    }
    throw Object.assign(new HttpError(405, 'Method not allowed.'), { allow: 'GET, POST' });
  }

  switch (req.method) {
    case 'GET': {
      const task = store.get(id);
      if (!task) throw new HttpError(404, 'Task not found.');
      return sendJson(res, 200, { task });
    }
    case 'PATCH':
    case 'PUT': {
      const body = await readJsonBody(req);
      const { value, fields } = validateTaskInput(body, { partial: true });
      if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', fields);
      return sendJson(res, 200, { task: await store.update(id, value) });
    }
    case 'DELETE':
      await store.remove(id);
      return sendJson(res, 200, { ok: true });
    default:
      throw Object.assign(new HttpError(405, 'Method not allowed.'), { allow: 'GET, PATCH, PUT, DELETE' });
  }
}

/* ------------------------------------------------------------------ */
/* Static files (explicit allow-list: the repo root also holds server  */
/* code and data, which must never be served)                          */
/* ------------------------------------------------------------------ */

const STATIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/style.css': 'style.css',
  '/script.js': 'script.js',
};
const STATIC_MODULE_RE = /^\/js\/[\w-]+\.js$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

async function handleStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw Object.assign(new HttpError(405, 'Method not allowed.'), { allow: 'GET, HEAD' });
  }
  let file = STATIC_FILES[url.pathname];
  if (!file && STATIC_MODULE_RE.test(url.pathname)) file = url.pathname.slice(1);
  if (!file) throw new HttpError(404, 'Not found.');

  let data;
  try {
    data = await fsp.readFile(path.join(ROOT, file));
  } catch {
    throw new HttpError(404, 'Not found.');
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': 'no-cache',
    ...SECURITY_HEADERS,
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

function createServer({ dataFile = path.join(ROOT, 'data', 'tasks.json') } = {}) {
  const store = new TaskStore(dataFile);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, store, url);
      else await handleStatic(req, res, url);
    } catch (err) {
      if (res.headersSent) return res.end();
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      const extra = err.allow ? { Allow: err.allow } : {};
      if (req.url.startsWith('/api/')) {
        sendJson(res, status, {
          error: status === 500 ? 'Something went wrong on the server.' : err.message,
          ...(err.fields ? { fields: err.fields } : {}),
        }, extra);
      } else {
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS, ...extra });
        res.end(status === 404 ? 'Not found' : err.message);
      }
    }
  });

  return { server, store };
}

async function start({ port = 3000, host = '127.0.0.1', dataFile } = {}) {
  const { server, store } = createServer({ dataFile });
  await store.init();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return { server, store };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  const dataFile = process.env.DATA_FILE || undefined;
  start({ port, host, dataFile })
    .then(({ server }) => {
      const { port: actual } = server.address();
      console.log(`Student Task Manager running at http://localhost:${actual}`);
    })
    .catch((err) => {
      console.error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set PORT to use another.` : err);
      process.exit(1);
    });

  const shutdown = () => process.exit(0);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createServer, start, TaskStore, validateTaskInput, isValidISODate };
