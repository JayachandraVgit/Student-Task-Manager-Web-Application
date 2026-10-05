// Pomodoro timer state machine. It has no DOM code so it can be tested in
// Node. Remaining time is derived from a wall-clock end time, so it stays
// accurate even when the browser throttles timers in a background tab.

export const MODES = {
  focus: { label: 'Focus', minutes: 25 },
  short: { label: 'Short break', minutes: 5 },
  long: { label: 'Long break', minutes: 15 },
};

export const SESSIONS_PER_SET = 4;

const pad = (n) => String(n).padStart(2, '0');

export function formatClock(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

export function createPomodoro({
  now = Date.now,
  onChange = () => {},
  onComplete = () => {},
  autoTick = true,
  modes = MODES,
} = {}) {
  const fullMs = (mode) => modes[mode].minutes * 60_000;
  const state = {
    mode: 'focus',
    running: false,
    remainingMs: fullMs('focus'),
    endAt: 0,
    completed: 0, // focus sessions finished in the current set of four
    taskId: null,
  };
  let timer = null;

  const emit = () => onChange({ ...state });
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  function start() {
    if (state.running) return;
    if (state.remainingMs <= 0) state.remainingMs = fullMs(state.mode);
    state.running = true;
    state.endAt = now() + state.remainingMs;
    if (autoTick) timer = setInterval(tick, 250);
    emit();
  }

  function pause() {
    if (!state.running) return;
    state.remainingMs = Math.max(0, state.endAt - now());
    state.running = false;
    stopTimer();
    emit();
  }

  function reset() {
    stopTimer();
    state.running = false;
    state.remainingMs = fullMs(state.mode);
    emit();
  }

  function setMode(mode) {
    if (!modes[mode]) return;
    stopTimer();
    state.running = false;
    state.mode = mode;
    state.remainingMs = fullMs(mode);
    emit();
  }

  function setTask(id) {
    state.taskId = id || null;
    emit();
  }

  function tick() {
    if (!state.running) return;
    const left = state.endAt - now();
    if (left > 0) {
      state.remainingMs = left;
      emit();
      return;
    }
    complete();
  }

  function complete() {
    stopTimer();
    const finished = state.mode;
    let next;
    if (finished === 'focus') {
      state.completed = Math.min(SESSIONS_PER_SET, state.completed + 1);
      next = state.completed >= SESSIONS_PER_SET ? 'long' : 'short';
    } else {
      if (finished === 'long') state.completed = 0;
      next = 'focus';
    }
    state.running = false;
    state.mode = next;
    state.remainingMs = fullMs(next);
    emit();
    onComplete({ finished, next, taskId: state.taskId });
  }

  return {
    get state() {
      return { ...state };
    },
    start,
    pause,
    reset,
    setMode,
    setTask,
    tick,
    destroy: stopTimer,
  };
}
