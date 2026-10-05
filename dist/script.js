// Student Task Manager - single-page dashboard.
// Plain ES modules, no build step. Data lives in the backend (see server.js).

import * as api from './js/api.js';
import {
  toISODate, addDays, formatLongDate, formatShortDate, formatWeekday,
  timeToMinutes, minutesToTime, formatDuration,
} from './js/dates.js';
import {
  tasksForDate, computeSummary, progressMessage, greeting,
  sortTasks, applyFilter, buildTimeline,
} from './js/stats.js';
import { createPomodoro, MODES, SESSIONS_PER_SET, formatClock } from './js/pomodoro.js';

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const USER_NAME = 'Jay'; // shown in the greeting and avatar
const BASE_TITLE = document.title;
const PRIORITY_LABEL = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' };
const TYPE_LABEL = { deep: 'Deep work', shallow: 'Shallow work' };

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  tasks: [],
  status: 'loading', // loading | ready | error
  error: '',
  today: toISODate(),
  date: toISODate(),
  filter: 'all',
  busy: new Set(), // task ids with a request in flight
};

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/** Create an element. Text is always inserted as text, never as HTML. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const isToday = () => state.date === state.today;

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

function toast(message, { kind = 'success', action, duration } = {}) {
  const node = el('div', { class: 'toast', dataset: { kind } }, el('span', {}, message));
  const remove = () => node.remove();
  if (action) {
    node.append(el('button', { type: 'button', onClick: () => { remove(); action.onClick(); } }, action.label));
  }
  $('#toasts').append(node);
  setTimeout(remove, duration ?? (kind === 'error' ? 6000 : action ? 7000 : 3500));
}

/* ------------------------------------------------------------------ */
/* Header, summary cards, progress                                     */
/* ------------------------------------------------------------------ */

function renderHeader() {
  const hour = new Date().getHours();
  $('#dateLabel').textContent = formatLongDate(state.date);
  $('#todayBtn').hidden = isToday();
  if (isToday()) {
    $('#greeting').textContent = `${greeting(hour)}, ${USER_NAME}!`;
    $('#subline').textContent = 'Make room for what matters. One task at a time.';
  } else {
    $('#greeting').textContent = state.date < state.today ? 'Looking back' : 'Planning ahead';
    $('#subline').textContent = `Showing tasks scheduled for ${formatShortDate(state.date)}.`;
  }
  $('#avatar').textContent = USER_NAME.charAt(0).toUpperCase();
}

function renderSummary() {
  const s = computeSummary(state.tasks, state.date, state.today);

  $('#statPending').textContent = s.pendingAll;
  const pendingSub = $('#statPendingSub');
  pendingSub.replaceChildren();
  if (s.overdue > 0) pendingSub.append(el('span', { class: 'warn' }, `${s.overdue} overdue`), ' · all days');
  else pendingSub.append('Across all days');

  $('#statRemaining').textContent = s.remaining;
  $('#statRemainingSub').textContent = s.total ? `of ${plural(s.total, 'task')} ${isToday() ? 'today' : 'this day'}` : 'Nothing scheduled';

  const groupSub = (g) => (g.count ? `${formatDuration(g.minutes)} · ${g.done} done` : 'None scheduled');
  $('#statDeep').textContent = s.deep.count;
  $('#statDeepSub').textContent = groupSub(s.deep);
  $('#statShallow').textContent = s.shallow.count;
  $('#statShallowSub').textContent = groupSub(s.shallow);

  $('#progressSub').textContent = `${s.completed} of ${plural(s.total, 'task')} completed`;
  $('#progressPercent').textContent = `${s.percent}%`;
  $('#progressFill').style.width = `${s.percent}%`;
  $('#progressTrack').setAttribute('aria-valuenow', String(s.percent));
  $('#progressTrack').setAttribute('aria-valuetext', `${s.percent}% of tasks completed`);
  $('#progressMessage').textContent = progressMessage(s);
}

/* ------------------------------------------------------------------ */
/* Filters + task list                                                 */
/* ------------------------------------------------------------------ */

function renderFilters(dayTasks) {
  for (const chip of $$('#filters .chip')) {
    const filter = chip.dataset.filter;
    chip.setAttribute('aria-pressed', String(state.filter === filter));
    $('.count', chip).textContent = applyFilter(dayTasks, filter).length;
  }
  const open = dayTasks.filter((t) => !t.completed).length;
  $('#openCount').textContent = state.status === 'ready' ? `${open} open` : '';
}

function stateBlock({ iconName, title, text, action, kind }) {
  return el('div', { class: `state${kind ? ` state-${kind}` : ''}` },
    el('span', { class: 'state-icon' }, icon(iconName)),
    el('h3', {}, title),
    text ? el('p', {}, text) : null,
    action,
  );
}

function taskRow(task) {
  const busy = state.busy.has(task.id);
  const meta = el('div', { class: 'task-meta' },
    task.time ? el('span', {}, icon('clock'), task.time) : null,
    el('span', {}, formatDuration(task.duration)),
    el('span', {}, TYPE_LABEL[task.type]),
  );
  return el('li', { class: 'task', dataset: { id: task.id, type: task.type, done: String(task.completed) } },
    el('input', {
      type: 'checkbox', class: 'check', checked: task.completed, disabled: busy,
      'aria-label': `${task.completed ? 'Reopen' : 'Complete'}: ${task.title}`,
      dataset: { focus: 'check' },
    }),
    el('div', { class: 'task-main' },
      el('p', { class: 'task-title' }, task.title),
      meta,
      task.description ? el('p', { class: 'task-desc', title: task.description }, task.description) : null,
    ),
    el('span', { class: `tag tag-${task.priority}` }, PRIORITY_LABEL[task.priority]),
    el('div', { class: 'task-actions' },
      el('button', { type: 'button', class: 'icon-btn', dataset: { action: 'edit', focus: 'edit' }, 'aria-label': `Edit: ${task.title}` }, icon('edit')),
      el('button', { type: 'button', class: 'icon-btn', dataset: { action: 'delete', focus: 'delete' }, 'aria-label': `Delete: ${task.title}`, disabled: busy }, icon('trash')),
    ),
  );
}

function renderTaskList() {
  const root = $('#taskList');
  root.setAttribute('aria-busy', String(state.status === 'loading'));

  // Keep keyboard focus on the same control after the list is rebuilt.
  const active = document.activeElement;
  const focusId = root.contains(active) ? active.closest('[data-id]')?.dataset.id : null;
  const focusKind = root.contains(active) ? active.dataset.focus : null;

  const dayTasks = tasksForDate(state.tasks, state.date);
  renderFilters(dayTasks);
  root.replaceChildren();

  if (state.status === 'loading') {
    root.append(el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
    return;
  }
  if (state.status === 'error') {
    root.append(stateBlock({
      kind: 'error', iconName: 'close', title: "Couldn't load your tasks", text: state.error,
      action: el('button', { type: 'button', class: 'btn btn-ghost', onClick: loadTasks }, 'Try again'),
    }));
    return;
  }
  if (dayTasks.length === 0) {
    root.append(stateBlock({
      iconName: 'calendar',
      title: isToday() ? 'Nothing planned for today' : `Nothing planned for ${formatShortDate(state.date)}`,
      text: 'Add a task to start shaping your day.',
      action: el('button', { type: 'button', class: 'btn btn-primary', onClick: () => openDialog() }, icon('plus'), 'Add task'),
    }));
    return;
  }

  const visible = sortTasks(applyFilter(dayTasks, state.filter));
  if (visible.length === 0) {
    const messages = {
      deep: 'No deep work tasks on this day.',
      shallow: 'No shallow work tasks on this day.',
      pending: 'Everything is done. Nice work.',
      completed: 'No completed tasks yet.',
    };
    root.append(stateBlock({ iconName: 'list', title: messages[state.filter] || 'No tasks to show.' }));
    return;
  }

  for (const type of ['deep', 'shallow']) {
    const items = visible.filter((t) => t.type === type);
    if (!items.length) continue;
    root.append(el('section', { class: 'group', dataset: { type } },
      el('div', { class: 'group-head' },
        el('h3', { class: 'group-title' }, icon(type), TYPE_LABEL[type]),
        el('span', { class: 'muted' }, plural(items.length, 'task')),
      ),
      el('ul', { class: 'rows' }, items.map(taskRow)),
    ));
  }

  if (focusId) $(`[data-id="${CSS.escape(focusId)}"] [data-focus="${focusKind}"]`, root)?.focus();
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

function renderTimeline() {
  const dayTasks = tasksForDate(state.tasks, state.date);
  const { scheduled, unscheduled } = buildTimeline(dayTasks);
  const body = $('#timelineBody');
  body.replaceChildren();

  $('#timelineHeading').textContent = isToday() ? 'Today' : formatWeekday(state.date);
  $('#timelineDate').textContent = formatShortDate(state.date);
  $('#timelineCount').textContent = scheduled.length ? plural(scheduled.length, 'event') : '';

  if (state.status !== 'ready') return;
  if (dayTasks.length === 0) {
    body.append(el('p', { class: 'timeline-empty' }, 'Your day is open. Tasks with a scheduled time appear here.'));
    return;
  }

  if (scheduled.length) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let nowPlaced = !isToday();
    const items = [];
    for (const { task, start, end } of scheduled) {
      if (!nowPlaced && start > nowMin) {
        items.push(el('li', { class: 'now', dataset: { now: 'true' } }, minutesToTime(nowMin)));
        nowPlaced = true;
      }
      items.push(el('li', { class: 'event', dataset: { type: task.type, done: String(task.completed) } },
        el('div', { class: 'event-time' }, minutesToTime(start), el('span', {}, minutesToTime(end))),
        el('div', { class: 'event-bar' }),
        el('div', {},
          el('p', { class: 'event-title' }, task.completed ? icon('check') : null, task.title),
          el('p', { class: 'event-meta' }, `${TYPE_LABEL[task.type]} · ${formatDuration(task.duration)}`),
        ),
      ));
    }
    if (!nowPlaced) items.push(el('li', { class: 'now', dataset: { now: 'true' } }, minutesToTime(nowMin)));
    body.append(el('ul', { class: 'events' }, items));
  } else {
    body.append(el('p', { class: 'timeline-note' }, 'No times set yet. Add a scheduled time to a task to place it on the timeline.'));
  }

  if (unscheduled.length) {
    body.append(el('div', { class: 'anytime' },
      el('h3', {}, scheduled.length ? 'Anytime' : 'Unscheduled'),
      el('ul', { class: 'events' }, unscheduled.map((t) =>
        el('li', { dataset: { type: t.type, done: String(t.completed) } },
          el('span', {}, t.title), el('span', {}, formatDuration(t.duration))))),
    ));
  }
}

/* ------------------------------------------------------------------ */
/* Render all                                                          */
/* ------------------------------------------------------------------ */

function renderAll() {
  renderHeader();
  renderSummary();
  renderTaskList();
  renderTimeline();
  syncPomodoroTasks();
}

/* ------------------------------------------------------------------ */
/* Data actions                                                        */
/* ------------------------------------------------------------------ */

async function loadTasks() {
  state.status = 'loading';
  renderAll();
  try {
    state.tasks = await api.listTasks();
    state.status = 'ready';
  } catch (err) {
    state.status = 'error';
    state.error = err.message;
  }
  renderAll();
}

const findTask = (id) => state.tasks.find((t) => t.id === id);
const replaceTask = (saved) => { state.tasks = state.tasks.map((t) => (t.id === saved.id ? saved : t)); };

async function toggleComplete(id, completed) {
  const task = findTask(id);
  if (!task || state.busy.has(id)) return;
  const previous = { completed: task.completed, completedAt: task.completedAt };
  state.busy.add(id);
  Object.assign(task, { completed, completedAt: completed ? new Date().toISOString() : null });
  renderAll();
  try {
    replaceTask(await api.updateTask(id, { completed }));
  } catch (err) {
    Object.assign(task, previous);
    toast(`Couldn't update the task. ${err.message}`, { kind: 'error' });
  } finally {
    state.busy.delete(id);
    renderAll();
  }
}

async function deleteTask(id) {
  const task = findTask(id);
  if (!task || state.busy.has(id)) return;
  state.busy.add(id);
  renderAll();
  try {
    await api.deleteTask(id);
    state.tasks = state.tasks.filter((t) => t.id !== id);
    if (pomodoro.state.taskId === id) pomodoro.setTask(null);
    toast('Task deleted', { action: { label: 'Undo', onClick: () => restoreTask(task) } });
  } catch (err) {
    toast(`Couldn't delete the task. ${err.message}`, { kind: 'error' });
  } finally {
    state.busy.delete(id);
    renderAll();
  }
}

async function restoreTask(task) {
  const { title, description, type, priority, duration, time, date, completed } = task;
  try {
    state.tasks.push(await api.createTask({ title, description, type, priority, duration, time, date, completed }));
    renderAll();
    toast('Task restored');
  } catch (err) {
    toast(`Couldn't restore the task. ${err.message}`, { kind: 'error' });
  }
}

/* ------------------------------------------------------------------ */
/* Add / edit dialog                                                   */
/* ------------------------------------------------------------------ */

const dialog = $('#taskDialog');
const form = $('#taskForm');
const fields = {
  title: $('#fTitle'), description: $('#fDescription'), duration: $('#fDuration'),
  time: $('#fTime'), date: $('#fDate'),
};
const errorEls = {
  title: $('#eTitle'), description: $('#eDescription'), duration: $('#eDuration'),
  time: $('#eTime'), date: $('#eDate'),
};
const DEFAULT_DURATION = { deep: 45, shallow: 10 };
const dlg = { editingId: null, saving: false, opener: null, durationTouched: false, priorityTouched: false, backdropDown: false };

const radioValue = (name) => form.elements[name].value;
const setRadio = (name, value) => { for (const r of form.elements[name]) r.checked = r.value === value; };

function syncPresets() {
  for (const b of $$('#durationPresets button')) {
    b.setAttribute('aria-pressed', String(Number(fields.duration.value) === Number(b.dataset.minutes)));
  }
  const tooLong = radioValue('type') === 'shallow' && Number(fields.duration.value) > 15;
  $('#durationHint').textContent = tooLong ? 'Shallow tasks usually take about 15 minutes or less.' : '';
}

function showErrors(errors = {}) {
  for (const [name, node] of Object.entries(errorEls)) {
    node.textContent = errors[name] || '';
    fields[name].setAttribute('aria-invalid', errors[name] ? 'true' : 'false');
  }
  const unmapped = Object.keys(errors).filter((k) => !(k in errorEls));
  $('#formError').textContent = unmapped.map((k) => errors[k]).join(' ');
}

function setSaving(saving) {
  dlg.saving = saving;
  const save = $('#dialogSave');
  save.disabled = saving;
  save.textContent = saving ? 'Saving…' : dlg.editingId ? 'Save changes' : 'Save task';
}

function openDialog(task = null) {
  dlg.editingId = task?.id ?? null;
  dlg.opener = document.activeElement;
  dlg.durationTouched = Boolean(task);
  dlg.priorityTouched = Boolean(task);
  showErrors();
  $('#formError').textContent = '';
  $('#dialogTitle').textContent = task ? 'Edit task' : 'Add task';
  $('#dialogSub').textContent = task ? 'Update the details of this task.' : 'Create a new task and choose its focus.';

  fields.title.value = task?.title ?? '';
  fields.description.value = task?.description ?? '';
  setRadio('type', task?.type ?? 'deep');
  setRadio('priority', task?.priority ?? 'medium');
  fields.duration.value = task?.duration ?? DEFAULT_DURATION.deep;
  fields.time.value = task?.time ?? '';
  fields.date.value = task?.date ?? state.date;
  setSaving(false);
  syncPresets();
  dialog.showModal();
  fields.title.focus();
}

function closeDialog() {
  if (dlg.saving) return;
  dialog.close();
}

function readForm() {
  return {
    title: fields.title.value.trim(),
    description: fields.description.value.trim(),
    type: radioValue('type'),
    priority: radioValue('priority'),
    duration: fields.duration.value === '' ? NaN : Number(fields.duration.value),
    time: fields.time.value || null,
    date: fields.date.value,
  };
}

function validateForm(data) {
  const errors = {};
  if (!data.title) errors.title = 'Enter a task name.';
  else if (data.title.length > 120) errors.title = 'Task name must be 120 characters or fewer.';
  if (data.description.length > 500) errors.description = 'Description must be 500 characters or fewer.';
  if (!Number.isInteger(data.duration) || data.duration < 1 || data.duration > 600) {
    errors.duration = 'Enter a whole number of minutes between 1 and 600.';
  }
  if (!data.date) errors.date = 'Choose a date.';
  return errors;
}

async function submitDialog(event) {
  event.preventDefault();
  if (dlg.saving) return; // blocks duplicate submissions (double click / Enter)
  const data = readForm();
  const errors = validateForm(data);
  showErrors(errors);
  const firstInvalid = Object.keys(errors)[0];
  if (firstInvalid) {
    fields[firstInvalid].focus();
    return;
  }

  setSaving(true);
  const editing = Boolean(dlg.editingId);
  try {
    let saved;
    if (editing) {
      saved = await api.updateTask(dlg.editingId, data);
      replaceTask(saved);
    } else {
      saved = await api.createTask(data);
      state.tasks.push(saved);
    }
    setSaving(false);
    dialog.close();
    renderAll();
    if (saved.date !== state.date) {
      toast(`${editing ? 'Task moved' : 'Task added'} to ${formatShortDate(saved.date)}`, {
        action: { label: 'View', onClick: () => { state.date = saved.date; renderAll(); } },
      });
    } else {
      toast(editing ? 'Task updated' : 'Task added');
    }
  } catch (err) {
    setSaving(false);
    if (err.fields) {
      showErrors(err.fields);
      const first = Object.keys(err.fields).find((k) => fields[k]);
      if (first) fields[first].focus();
    } else {
      $('#formError').textContent = err.message;
    }
  }
}

function initDialog() {
  form.addEventListener('submit', submitDialog);
  $('#dialogClose').addEventListener('click', closeDialog);
  $('#dialogCancel').addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', (e) => { if (dlg.saving) e.preventDefault(); }); // Escape
  dialog.addEventListener('close', () => { dlg.opener?.isConnected && dlg.opener.focus?.(); });
  // Close on backdrop click, but not when a text selection drag ends outside.
  dialog.addEventListener('mousedown', (e) => { dlg.backdropDown = e.target === dialog; });
  dialog.addEventListener('click', (e) => { if (e.target === dialog && dlg.backdropDown) closeDialog(); });

  for (const radio of form.elements.type) {
    radio.addEventListener('change', () => {
      if (!dlg.durationTouched) fields.duration.value = DEFAULT_DURATION[radio.value];
      if (!dlg.priorityTouched) setRadio('priority', radio.value === 'shallow' ? 'low' : 'medium');
      syncPresets();
    });
  }
  for (const radio of form.elements.priority) radio.addEventListener('change', () => { dlg.priorityTouched = true; });
  fields.duration.addEventListener('input', () => { dlg.durationTouched = true; syncPresets(); });
  $('#durationPresets').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-minutes]');
    if (!btn) return;
    fields.duration.value = btn.dataset.minutes;
    dlg.durationTouched = true;
    syncPresets();
  });
}

/* ------------------------------------------------------------------ */
/* Pomodoro                                                            */
/* ------------------------------------------------------------------ */

const STATUS_TEXT = {
  focus: { idle: 'Time for a fresh start', running: 'Stay with one thing', paused: 'Paused' },
  short: { idle: 'Take a breather', running: 'Rest your eyes', paused: 'Paused' },
  long: { idle: 'You earned a longer break', running: 'Step away from the screen', paused: 'Paused' },
};

const pomodoro = createPomodoro({
  onChange: updatePomodoro,
  onComplete: ({ finished, next }) => {
    beep();
    const nextMin = MODES[next].minutes;
    toast(
      finished === 'focus'
        ? `Focus session complete. Time for a ${nextMin} min ${next === 'long' ? 'long ' : ''}break.`
        : 'Break over. Ready for the next focus session?',
    );
  },
});

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain).connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
    osc.onended = () => ctx.close();
  } catch { /* audio is a nice-to-have */ }
}

function updatePomodoro(s) {
  const root = $('#pomodoro');
  const clock = formatClock(s.remainingMs);
  const full = s.remainingMs >= MODES[s.mode].minutes * 60_000;
  const phase = s.running ? 'running' : full ? 'idle' : 'paused';

  root.dataset.mode = s.mode;
  $('#pomoTime').textContent = clock;
  $('#pomoMiniTime').textContent = clock;
  $('#pomoMiniMode').textContent = MODES[s.mode].label;
  $('#pomoStatus').textContent = STATUS_TEXT[s.mode][phase];
  for (const b of $$('.pomo-tabs button')) b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode));

  const start = $('#pomoStart');
  start.replaceChildren(icon(s.running ? 'pause' : 'play'), el('span', {}, s.running ? 'Pause' : phase === 'paused' ? 'Resume' : 'Start'));

  $$('#pomoDots i').forEach((dot, i) => {
    dot.dataset.state = i < s.completed ? 'done' : s.mode === 'focus' && i === s.completed ? 'current' : '';
  });
  $('#pomoSession').textContent =
    s.mode === 'focus' ? `Focus ${Math.min(s.completed + 1, SESSIONS_PER_SET)} of ${SESSIONS_PER_SET}`
    : s.mode === 'short' ? `Break after session ${s.completed}`
    : 'Set complete';

  document.title = s.running ? `${clock} · ${MODES[s.mode].label} — ${BASE_TITLE}` : BASE_TITLE;
}

let pomoOptionsKey = '';
function syncPomodoroTasks() {
  const select = $('#pomoTask');
  const candidates = sortTasks(tasksForDate(state.tasks, state.date).filter((t) => t.type === 'deep' && !t.completed));
  const key = candidates.map((t) => `${t.id}:${t.title}`).join('|');
  const selected = pomodoro.state.taskId;
  if (selected && !candidates.some((t) => t.id === selected)) pomodoro.setTask(null);
  if (key === pomoOptionsKey) return;
  pomoOptionsKey = key;
  select.replaceChildren(
    el('option', { value: '' }, candidates.length ? 'No task selected' : 'No open deep work tasks'),
    ...candidates.map((t) => el('option', { value: t.id }, t.title)),
  );
  select.value = pomodoro.state.taskId || '';
  select.disabled = candidates.length === 0;
}

function initPomodoro() {
  const root = $('#pomodoro');
  const toggle = $('#pomoToggle');
  const setOpen = (open) => {
    root.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    $('#pomoBody').hidden = !open;
    try { localStorage.setItem('stm.pomodoroOpen', String(open)); } catch { /* storage may be blocked */ }
  };
  let startOpen = false;
  try { startOpen = localStorage.getItem('stm.pomodoroOpen') === 'true'; } catch { /* ignore */ }
  setOpen(startOpen);

  toggle.addEventListener('click', () => setOpen(root.dataset.open !== 'true'));
  $('#pomoStart').addEventListener('click', () => (pomodoro.state.running ? pomodoro.pause() : pomodoro.start()));
  $('#pomoReset').addEventListener('click', () => pomodoro.reset());
  $('.pomo-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (btn) pomodoro.setMode(btn.dataset.mode);
  });
  $('#pomoTask').addEventListener('change', (e) => pomodoro.setTask(e.target.value));
  updatePomodoro(pomodoro.state);
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function initEvents() {
  $('#addTaskBtn').addEventListener('click', () => openDialog());

  $('#taskList').addEventListener('change', (e) => {
    if (e.target.matches('.check')) toggleComplete(e.target.closest('[data-id]').dataset.id, e.target.checked);
  });
  $('#taskList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    if (btn.dataset.action === 'edit') openDialog(findTask(id));
    if (btn.dataset.action === 'delete') deleteTask(id);
  });

  $('#filters').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    renderTaskList();
  });

  $('#prevDay').addEventListener('click', () => { state.date = addDays(state.date, -1); renderAll(); });
  $('#nextDay').addEventListener('click', () => { state.date = addDays(state.date, 1); renderAll(); });
  $('#todayBtn').addEventListener('click', () => { state.date = state.today; renderAll(); });
}

// Keep the "Now" marker current and roll over at midnight.
function startClock() {
  setInterval(() => {
    const today = toISODate();
    if (today !== state.today) {
      if (state.date === state.today) state.date = today;
      state.today = today;
      renderAll();
    } else {
      renderTimeline();
    }
  }, 60_000);
}

initEvents();
initDialog();
initPomodoro();
startClock();
loadTasks();
