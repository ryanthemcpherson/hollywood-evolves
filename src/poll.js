const root = document.querySelector('[data-poll-root]');
const dialog = document.querySelector('#audience-poll');
const form = document.querySelector('[data-poll-form]');
const title = document.querySelector('#poll-title');
const state = document.querySelector('#poll-state');
const dialogTitle = document.querySelector('#poll-dialog-title');
const results = document.querySelector('#poll-results');
const status = document.querySelector('[data-submit-status]');
const submit = document.querySelector('.poll-submit');
const choiceButtons = [...document.querySelectorAll('[data-choice]')];
const allowedSources = new Set(['site', 'linkedin', 'newsletter', 'qr', 'direct']);
const pathId = location.pathname.split('/').filter(Boolean).at(-1);
const params = new URLSearchParams(location.search);
const questionId = params.get('poll') || pathId;
const requestedSource = params.get('src') || 'direct';
const source = allowedSources.has(requestedSource) ? requestedSource : 'direct';
let selectedChoice = null;

root.dataset.source = source;

function storageGet(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}
function storageSet(storage, key, value) {
  try { storage.setItem(key, value); } catch { /* The poll remains usable when storage is blocked. */ }
}
function randomToken() {
  if (globalThis.crypto?.randomUUID) return `${crypto.randomUUID()}${crypto.randomUUID()}`;
  return `${Date.now()}-${Math.random()}-${Math.random()}`;
}
function browserToken() {
  const key = 'he-audience-browser-token';
  const existing = storageGet(localStorage, key);
  if (existing?.length >= 16) return existing;
  const created = randomToken();
  storageSet(localStorage, key, created);
  return created;
}
function renderResults(payload) {
  const direct = payload.results.directForecasts;
  const reactions = payload.results.linkedInReactions;
  document.querySelector('[data-direct-results]').textContent = `Direct forecasts: ${direct.total} total · ${direct.yes} yes · ${direct.no} no${direct.averageConfidence === null ? '' : ` · ${Math.round(direct.averageConfidence)}% average confidence`}.`;
  document.querySelector('[data-reaction-results]').textContent = `LinkedIn reaction signal: ${reactions.total} total · ${reactions.yes} yes · ${reactions.no} no. Reactions are not probability forecasts.`;
  results.hidden = false;
}

choiceButtons.forEach((button) => button.addEventListener('click', () => {
  selectedChoice = button.dataset.choice;
  choiceButtons.forEach((candidate) => candidate.setAttribute('aria-pressed', String(candidate === button)));
  submit.disabled = false;
}));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedChoice) return;
  const confidenceField = document.querySelector('#poll-confidence');
  const confidence = confidenceField.value === '' ? null : Number(confidenceField.value);
  if (confidence !== null && (!Number.isInteger(confidence) || confidence < 1 || confidence > 99)) {
    status.textContent = 'Confidence must be a whole number from 1 to 99.';
    confidenceField.focus();
    return;
  }
  submit.disabled = true;
  status.textContent = 'Submitting…';
  const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ choice: selectedChoice, confidence, browserToken: browserToken(), idempotencyKey: randomToken(), source, consent: true }),
  });
  const payload = await response.json().catch(() => ({ error: 'The response could not be read.' }));
  if (!response.ok) {
    status.textContent = payload.error || 'Your answer could not be recorded.';
    submit.disabled = false;
    return;
  }
  storageSet(localStorage, `he-audience-answered:${questionId}`, '1');
  status.textContent = payload.duplicate ? 'Your earlier answer is already recorded.' : 'Thank you. Your aggregate answer was recorded.';
  setTimeout(() => dialog.close(), 800);
  const refreshed = await fetch(`/api/questions/${encodeURIComponent(questionId)}`, { cache: 'no-store' }).then((item) => item.json());
  renderResults(refreshed);
});

dialog.addEventListener('close', () => {
  if (!storageGet(localStorage, `he-audience-answered:${questionId}`)) storageSet(sessionStorage, `he-audience-skipped:${questionId}`, '1');
});

try {
  const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 404 ? 'Question not found.' : 'Question status is unavailable.');
  const payload = await response.json();
  title.textContent = payload.question.prompt;
  dialogTitle.textContent = payload.question.prompt;
  if (payload.question.state !== 'open') {
    state.textContent = 'This question is still a draft and is not open for audience responses.';
  } else {
    state.textContent = 'This question is open for audience responses.';
    renderResults(payload);
    const answered = storageGet(localStorage, `he-audience-answered:${questionId}`);
    const skipped = storageGet(sessionStorage, `he-audience-skipped:${questionId}`);
    if (!answered && !skipped) dialog.showModal();
  }
} catch (error) {
  title.textContent = 'Question unavailable';
  state.textContent = error.message;
}
