// Episode 01 forecast: a browser-local probability that becomes an account-tied forecast
// when LinkedIn sign-in is enabled on the server (see docs/forecasting-api.md).
// With sign-in off, /api/session reports authEnabled: false and the control stays local-only.

const questionId = 'he-episode-01-customer-evolution-v1';
const storageKey = 'he-private-forecast';

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* The local control still works. */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* No dependent state. */ } },
};

const element = (id) => document.getElementById(id);
const readerCall = document.querySelector('.reader-call');
const input = element('forecast-probability');
const output = element('forecast-output');
const privacyNote = element('privacy-note');
const guestPanel = element('account-guest');
const memberPanel = element('account-member');
const submitButton = element('submit-forecast');
const statusLine = element('forecast-status');
const accountStatus = element('account-status');

const copy = {
  local: 'Your forecast is saved only in this browser. It is not submitted, published, or counted in a Community Forecast.',
  guest: 'Your forecast is saved in this browser until you sign in. Signing in with LinkedIn lets you submit it to the Community Forecast.',
  member: 'Submitted forecasts are stored with your LinkedIn account. The public sees only the Community Forecast, never your individual forecast.',
};
const errors = {
  question_not_open: 'This question is not open for forecasts right now.',
  invalid_probability: 'Choose a whole number from 1 to 99.',
  rate_limited: 'You have updated this forecast many times in the last hour. Try again later.',
  unavailable: 'Forecasting is briefly unavailable. Your forecast is still saved in this browser.',
};
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const state = { csrfToken: null, hasCurrent: false, questionOpen: true };

export function parseProbability(raw) {
  if (typeof raw !== 'string' || !/^\d{1,2}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= 99 ? value : null;
}

function describeProbability(value) {
  if (value === null) return 'Not set';
  if (value >= 60) return `${value}% · leaning YES`;
  if (value <= 40) return `${value}% · leaning NO`;
  return `${value}% · toss-up`;
}

function showProbability(value) {
  const description = describeProbability(value);
  readerCall?.classList.toggle('is-unset', value === null);
  if (output) output.textContent = description;
  input?.setAttribute('aria-valuetext', description);
}

function setProbability(value) {
  if (input) input.value = String(value ?? 50);
  showProbability(value);
}

function setupLocalForecast() {
  const stored = storage.get(storageKey);
  const probability = parseProbability(stored);
  if (probability === null && stored !== null) storage.remove(storageKey);
  setProbability(probability);
  input?.addEventListener('input', () => {
    const value = parseProbability(input.value);
    if (value === null) return;
    storage.set(storageKey, String(value));
    showProbability(value);
    if (statusLine) statusLine.textContent = '';
  });
  element('reset-forecast')?.addEventListener('click', () => {
    storage.remove(storageKey);
    setProbability(null);
    input?.focus();
  });
}

async function request(url, { method = 'GET', body } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && state.csrfToken) headers['x-csrf-token'] = state.csrfToken;
  try {
    const response = await fetch(url, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

function setMode(mode) {
  if (readerCall) readerCall.dataset.mode = mode;
  if (privacyNote) privacyNote.textContent = copy[mode];
  if (guestPanel) guestPanel.hidden = mode !== 'guest';
  if (memberPanel) memberPanel.hidden = mode !== 'member';
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function renderCommunity(data) {
  const panel = element('community-forecast');
  const value = element('community-value');
  const detail = element('community-detail');
  const experts = element('expert-list');
  if (!panel || !value || !detail || !experts) return;
  const count = Number(data.forecasters) || 0;
  const minimum = Number(data.minimumForecasters) || 10;
  if (data.community && Number.isInteger(data.community.probability)) {
    value.textContent = `${data.community.probability}%`;
    detail.textContent = `Median of ${plural(count, 'forecaster')}' current forecasts.`;
  } else {
    value.textContent = count === 0 ? 'No forecasts yet' : `${count} of ${minimum} forecasters so far`;
    detail.textContent = `The Community Forecast appears once ${minimum} people have forecast.`;
  }
  if (data.resolution?.outcome) {
    const resolved = data.resolution.resolvedAt ? ` on ${timeFormat.format(new Date(data.resolution.resolvedAt))}` : '';
    detail.textContent += ` Resolved ${String(data.resolution.outcome).toUpperCase()}${resolved}.`;
  }
  experts.replaceChildren(...(Array.isArray(data.expert) ? data.expert : []).map((forecast) => {
    const item = document.createElement('li');
    const who = document.createElement('span');
    who.textContent = forecast.role ? `${forecast.name}, ${forecast.role}` : String(forecast.name);
    const probability = document.createElement('strong');
    probability.textContent = `${forecast.probability}%`;
    item.append(who, probability);
    return item;
  }));
  experts.hidden = experts.childElementCount === 0;
  state.questionOpen = data.status === 'open';
  if (submitButton) submitButton.disabled = !state.questionOpen;
  if (!state.questionOpen && statusLine && readerCall?.dataset.mode === 'member') statusLine.textContent = errors.question_not_open;
  panel.hidden = false;
}

async function loadCommunity() {
  const response = await request(`/api/forecasts/${questionId}`);
  if (response.status === 200 && response.data) renderCommunity(response.data);
}

function renderMine(data) {
  const history = Array.isArray(data?.history) ? data.history : [];
  const list = element('forecast-history-list');
  list?.replaceChildren(...history.map((entry) => {
    const item = document.createElement('li');
    const probability = document.createElement('strong');
    probability.textContent = `${entry.probability}%`;
    const when = document.createElement('time');
    when.dateTime = entry.submittedAt;
    when.textContent = timeFormat.format(new Date(entry.submittedAt));
    item.append(probability, when);
    return item;
  }));
  const details = element('forecast-history');
  if (details) details.hidden = history.length === 0;
  state.hasCurrent = Boolean(data?.current);
  if (submitButton) submitButton.textContent = state.hasCurrent ? 'Update forecast' : 'Submit forecast';
  if (data?.current) {
    setProbability(data.current.probability);
    storage.set(storageKey, String(data.current.probability));
  }
  if (data?.score && Number.isFinite(data.score.brier) && statusLine) {
    statusLine.textContent = `Your Brier score: ${data.score.brier.toFixed(3)} (0 is perfect).`;
  }
}

async function loadMine() {
  const response = await request(`/api/forecasts/${questionId}/mine`);
  if (response.status === 401) return enterGuest();
  if (response.status !== 200) {
    if (statusLine) statusLine.textContent = 'Your forecast history could not be loaded.';
    return;
  }
  renderMine(response.data);
  if (!state.hasCurrent && parseProbability(storage.get(storageKey)) !== null && statusLine) {
    statusLine.textContent = 'Your saved forecast is ready to submit.';
  }
}

function enterGuest() {
  state.csrfToken = null;
  state.hasCurrent = false;
  setMode('guest');
}

function enterMember(session) {
  state.csrfToken = session.csrfToken || null;
  const name = element('member-name');
  if (name) name.textContent = session.member?.name || 'LinkedIn member';
  if (accountStatus) accountStatus.textContent = '';
  setMode('member');
  return loadMine();
}

async function submitForecast() {
  const probability = parseProbability(input?.value ?? '');
  if (readerCall?.classList.contains('is-unset') || probability === null) {
    statusLine.textContent = 'Move the slider to choose your forecast first.';
    input?.focus();
    return;
  }
  submitButton.disabled = true;
  submitButton.setAttribute('aria-busy', 'true');
  statusLine.textContent = 'Submitting…';
  const response = await request(`/api/forecasts/${questionId}`, { method: 'POST', body: { probability } });
  submitButton.removeAttribute('aria-busy');
  submitButton.disabled = !state.questionOpen;
  if (response.status === 201) {
    renderMine(response.data);
    const at = response.data?.current?.submittedAt ? ` at ${timeFormat.format(new Date(response.data.current.submittedAt))}` : '';
    statusLine.textContent = `Submitted ${probability}%${at}.`;
    loadCommunity();
    return;
  }
  if (response.status === 401 || response.status === 403) {
    enterGuest();
    if (accountStatus) accountStatus.textContent = 'Your session ended. Sign in again to submit; your forecast is still saved in this browser.';
    return;
  }
  statusLine.textContent = errors[response.data?.error] || (response.status === 0
    ? 'Could not reach Hollywood Evolves. Your forecast is still saved in this browser.'
    : 'Your forecast was not submitted. Try again.');
}

async function signOut() {
  const response = await request('/api/session/logout', { method: 'POST' });
  if (response.status === 200) {
    enterGuest();
    if (accountStatus) accountStatus.textContent = 'You are signed out.';
    element('signin-link')?.focus();
  } else if (statusLine) {
    statusLine.textContent = 'Sign-out failed. Try again.';
  }
}

async function deleteAccount() {
  const confirmed = window.confirm('Delete your Hollywood Evolves account? Your LinkedIn name and email and your comments are deleted. Your forecasts stay in the Community Forecast without your name or email.');
  if (!confirmed) return;
  const response = await request('/api/account', { method: 'DELETE' });
  if (response.status === 200) {
    enterGuest();
    if (accountStatus) accountStatus.textContent = 'Your account was deleted.';
    element('signin-link')?.focus();
  } else if (statusLine) {
    statusLine.textContent = 'Your account was not deleted. Try again.';
  }
}

async function connectAccount() {
  const session = await request('/api/session');
  if (session.status !== 200 || session.data?.authEnabled !== true) return;
  loadCommunity();
  if (session.data.authenticated) await enterMember(session.data);
  else enterGuest();
}

export function initForecasting() {
  setupLocalForecast();
  submitButton?.addEventListener('click', submitForecast);
  element('sign-out')?.addEventListener('click', signOut);
  element('delete-account')?.addEventListener('click', deleteAccount);
  connectAccount();
}
