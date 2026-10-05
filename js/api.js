// Thin client for the backend REST API.

export class ApiError extends Error {
  constructor(message, { status = 0, fields } = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Start the app with npm start and try again.");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response, e.g. the page was opened without the backend */
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status}).`, { status: res.status, fields: data?.fields });
  }
  if (data === null) throw new ApiError('The server sent an unexpected response. Is the backend running?');
  return data;
}

export const listTasks = (date) =>
  request('GET', date ? `/api/tasks?date=${encodeURIComponent(date)}` : '/api/tasks').then((d) => d.tasks);
export const createTask = (input) => request('POST', '/api/tasks', input).then((d) => d.task);
export const updateTask = (id, patch) => request('PATCH', `/api/tasks/${encodeURIComponent(id)}`, patch).then((d) => d.task);
export const deleteTask = (id) => request('DELETE', `/api/tasks/${encodeURIComponent(id)}`);
