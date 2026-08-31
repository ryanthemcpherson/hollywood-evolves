import './commentary.js';

document.documentElement.classList.add('enhanced');

const deepLinkParams = new URLSearchParams(location.search);
const deepLinkQuestion = deepLinkParams.get('poll');
if (/^he-[a-z0-9-]+-v\d+$/.test(deepLinkQuestion || '')) {
  const source = deepLinkParams.get('src');
  const suffix = source ? `?src=${encodeURIComponent(source)}` : '';
  location.replace(`/poll/${encodeURIComponent(deepLinkQuestion)}${suffix}`);
}

const forecastChoices = [...document.querySelectorAll('input[name="private-forecast"]')];
const reset = document.querySelector('#reset-forecast');
const menuButton = document.querySelector('.menu-button');
const menu = document.querySelector('#menu');
const shareButton = document.querySelector('#share-forecast');
const shareStatus = document.querySelector('#share-status');
const shareFallback = document.querySelector('#share-fallback');
const shareUrl = document.querySelector('#share-url');
const instrument = document.querySelector('.instrument');
const instrumentStage = document.querySelector('.instrument-stage');
const instrumentTabs = [...document.querySelectorAll('[data-instrument-tab]')];
const instrumentPanels = [...document.querySelectorAll('[data-instrument-panel]')];
const demoBanner = document.querySelector('.demo-banner');

function demoUnavailable() {
  document.documentElement.dataset.demoState = 'unavailable';
  if (demoBanner) demoBanner.innerHTML = '<strong>DEMO DATA UNAVAILABLE</strong><span>Illustrative values could not be loaded. Draft questions remain not open and unresolved; no live values are shown.</span>';
  const head = document.querySelector('.instrument-head b');
  if (head) head.textContent = 'DEMO DATA UNAVAILABLE · NOT OPEN';
  instrumentPanels.forEach((panel) => { panel.append(' DEMO DATA UNAVAILABLE. No sample values are shown.'); });
}

function renderDemoState(payload) {
  const validText = (value, maximum = 200) => typeof value === 'string' && value.length > 0 && value.length <= maximum;
  const validPair = ({ yes, no } = {}) => Number.isInteger(yes) && Number.isInteger(no) && yes >= 0 && no >= 0 && yes + no === 100;
  const validMetadata = payload?.metadata && Number.isInteger(payload.metadata.seedVersion)
    && validText(payload.metadata.asOf) && !Number.isNaN(Date.parse(payload.metadata.asOf));
  const validViews = Array.isArray(payload?.headline?.views) && payload.headline.views.length === 3
    && payload.headline.views.every((view) => validPair(view) && validText(view.label, 40) && validText(view.status));
  const validQuestions = Array.isArray(payload?.questions) && payload.questions.length === 8
    && payload.questions.every((question) => validPair(question) && /^question-0[1-8]$/.test(question.displayId) && validText(question.status));
  const validOutcome = payload?.headline?.outcome?.state === 'unresolved'
    && validText(payload.headline.outcome.threshold, 500) && validText(payload.headline.outcome.deadline, 100);
  if (payload?.demo !== true || !validText(payload.label) || !validMetadata || !validViews || !validQuestions
    || !Array.isArray(payload.headline.evidence) || payload.headline.evidence.length < 1 || !validOutcome) throw new Error('Invalid demo payload');
  document.documentElement.dataset.demoState = 'ready';
  if (demoBanner) {
    const strong = document.createElement('strong');
    const detail = document.createElement('span');
    strong.textContent = payload.label;
    detail.textContent = `Display-only sample values · seed ${payload.metadata.seedVersion} · as of ${new Date(payload.metadata.asOf).toLocaleDateString('en-US', { timeZone: 'UTC' })}. Not live forecasts or community input.`;
    demoBanner.replaceChildren(strong, detail);
  }
  const [evidencePanel, viewsPanel, outcomePanel] = instrumentPanels;
  evidencePanel.textContent = `Evidence · DEMO. ${payload.headline.evidence.length} illustrative signals: ${payload.headline.evidence.map(({ status }) => status).join(' · ')}.`;
  viewsPanel.textContent = `Three views · DEMO. ${payload.headline.views.map(({ label, yes, no }) => `${label} ${yes}% YES / ${no}% NO`).join(' · ')}.`;
  outcomePanel.textContent = `Outcome · DEMO. Unresolved. Threshold: ${payload.headline.outcome.threshold} Deadline: ${payload.headline.outcome.deadline}.`;
  const gate = document.querySelector('.forecast-gate');
  if (gate) gate.innerHTML = '<small>DEMO OUTCOME</small><strong>—</strong><span>Unresolved · sample only</span>';
  const head = document.querySelector('.instrument-head b');
  if (head) head.textContent = 'DEMO · NOT OPEN · UNRESOLVED';
  const foot = document.querySelector('.instrument-foot span');
  if (foot) foot.textContent = `DEMO · ${payload.headline.evidence.length} illustrative signals · unresolved`;

  const ledgerRows = [...document.querySelectorAll('.ledger tbody tr')];
  payload.headline.views.forEach((view, index) => {
    const cells = ledgerRows[index]?.querySelectorAll('td');
    if (!cells?.length) return;
    cells[0].textContent = `${view.yes}% YES / ${view.no}% NO`;
    cells[1].textContent = `DEMO · ${view.status}`;
  });
  document.querySelector('.ledger')?.setAttribute('data-demo', 'true');

  const cardsById = new Map([...document.querySelectorAll('.motion-card[data-question-id]')]
    .map((card) => [card.dataset.questionId, card]));
  payload.questions.forEach((question) => {
    const card = cardsById.get(question.displayId);
    if (!card) return;
    card.dataset.demo = 'true';
    let aggregate = card.querySelector('.demo-card-aggregate');
    if (!aggregate) {
      aggregate = document.createElement('p');
      aggregate.className = 'demo-card-aggregate';
      card.querySelector('.motion-card-link')?.append(aggregate);
    }
    aggregate.textContent = `DEMO · ${question.yes}% YES / ${question.no}% NO · ${question.status}`;
  });
}

fetch('/api/demo-state', { cache: 'no-store' })
  .then(async (response) => { if (!response.ok) throw new Error('Demo unavailable'); return response.json(); })
  .then(renderDemoState)
  .catch(demoUnavailable);

function selectInstrumentState(state, moveFocus = false) {
  const selectedTab = instrumentTabs.find((tab) => tab.dataset.instrumentTab === state);
  if (!selectedTab) return;
  instrument.dataset.instrumentState = state;
  instrumentTabs.forEach((tab) => {
    const selected = tab === selectedTab;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  instrumentPanels.forEach((panel) => { panel.hidden = panel.dataset.instrumentPanel !== state; });
  if (moveFocus) selectedTab.focus();
}

instrumentTabs.forEach((tab) => {
  tab.addEventListener('click', () => selectInstrumentState(tab.dataset.instrumentTab));
  tab.addEventListener('focus', () => selectInstrumentState(tab.dataset.instrumentTab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = instrumentTabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? instrumentTabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + instrumentTabs.length) % instrumentTabs.length;
    selectInstrumentState(instrumentTabs[next].dataset.instrumentTab, true);
  });
});
selectInstrumentState('evidence');

const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function resetInstrumentPointer() {
  instrumentStage?.style.removeProperty('--pointer-x');
  instrumentStage?.style.removeProperty('--pointer-y');
}
instrumentStage?.addEventListener('pointermove', (event) => {
  if (!finePointer.matches || reducedMotion.matches) return;
  const rect = instrumentStage.getBoundingClientRect();
  instrumentStage.style.setProperty('--pointer-x', ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
  instrumentStage.style.setProperty('--pointer-y', ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
});
instrumentStage?.addEventListener('pointerleave', resetInstrumentPointer);
reducedMotion.addEventListener?.('change', resetInstrumentPointer);

const questionCards = [...document.querySelectorAll('.motion-card-link')];
const motionCards = [...document.querySelectorAll('.motion-card')];
const questionRows = [...document.querySelectorAll('.season-ledger > li')];
const questionCalls = [...document.querySelectorAll('input[data-question-call]')];
questionRows.forEach((row, index) => { row.id = `question-${String(index + 1).padStart(2, '0')}`; });
questionCards.forEach((card) => card.addEventListener('click', () => {
  const row = document.querySelector(card.hash);
  const disclosure = row?.querySelector('details');
  if (disclosure) disclosure.open = true;
}));
motionCards.forEach((card) => {
  const reset = () => {
    card.style.removeProperty('--card-pointer-x');
    card.style.removeProperty('--card-pointer-y');
    card.style.removeProperty('animation-play-state');
  };
  card.addEventListener('pointerenter', () => {
    if (!reducedMotion.matches) card.style.animationPlayState = 'paused';
  });
  card.addEventListener('pointermove', (event) => {
    if (!finePointer.matches || reducedMotion.matches) return;
    card.style.animationPlayState = 'paused';
    const rect = card.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
    card.style.setProperty('--card-pointer-x', `${x.toFixed(1)}%`);
    card.style.setProperty('--card-pointer-y', `${y.toFixed(1)}%`);
  });
  card.addEventListener('pointerleave', reset);
  reducedMotion.addEventListener?.('change', reset);
});

const questionCallStorage = {
  get() {
    try {
      const value = JSON.parse(localStorage.getItem('he-private-question-calls') || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  },
  set(value) {
    try { localStorage.setItem('he-private-question-calls', JSON.stringify(value)); } catch { /* Calls remain usable without persistence. */ }
  },
};
const storedQuestionCalls = questionCallStorage.get();
questionCalls.forEach((choice) => {
  const questionId = choice.closest('.motion-card')?.dataset.questionId;
  if (questionId && storedQuestionCalls[questionId] === choice.value) choice.checked = true;
  choice.addEventListener('change', () => {
    if (!questionId) return;
    storedQuestionCalls[questionId] = choice.value;
    questionCallStorage.set(storedQuestionCalls);
  });
});

const storage = {
  get() { try { return localStorage.getItem('he-private-forecast'); } catch { return null; } },
  set(value) { try { localStorage.setItem('he-private-forecast', value); } catch { /* The control still works without persistence. */ } },
  remove() { try { localStorage.removeItem('he-private-forecast'); } catch { /* Nothing else depends on storage. */ } },
};

const stored = storage.get();
if (stored === 'yes' || stored === 'no') document.querySelector(`input[value="${stored}"]`).checked = true;
else if (stored !== null) storage.remove();

forecastChoices.forEach((choice) => choice.addEventListener('change', () => {
  storage.set(choice.value);
}));
reset.addEventListener('click', () => {
  forecastChoices.forEach((choice) => { choice.checked = false; });
  storage.remove();
  forecastChoices[0].focus();
});

function setMenu(open, returnFocus = false) {
  menuButton.setAttribute('aria-expanded', String(open));
  menu.classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open);
  if (returnFocus && !open) menuButton.focus();
}

menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
menu.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  setMenu(false);
  const destination = document.querySelector(link.hash);
  if (destination) setTimeout(() => {
    destination.setAttribute('tabindex', '-1');
    destination.focus({ preventScroll: true });
  }, 0);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') setMenu(false, true);
});
document.addEventListener('pointerdown', (event) => {
  if (menuButton.getAttribute('aria-expanded') === 'true' && !event.target.closest('nav')) {
    setMenu(false);
    const focusableTarget = event.target.closest('a, button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])');
    if (!focusableTarget) setTimeout(() => menuButton.focus(), 0);
  }
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 800) setMenu(false);
});

const shareData = {
  title: 'Hollywood Evolves — Episode 01 forecast',
  text: 'Consider the draft Episode 01 forecast on the future of ad-supported streaming plans.',
  url: 'https://hollywoodevolves.mcpherson.app/#forecast',
};

function revealShareUrl(message) {
  shareFallback.hidden = false;
  shareUrl.value = shareData.url;
  shareUrl.focus();
  shareUrl.select();
  shareStatus.textContent = message;
}

shareButton.addEventListener('click', async () => {
  shareFallback.hidden = true;
  shareStatus.textContent = '';
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(shareData);
      shareStatus.textContent = 'Sharing request completed.';
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        shareStatus.textContent = 'Sharing canceled.';
        return;
      }
    }
  }
  if (typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(shareData.url);
      shareStatus.textContent = 'Draft question URL copied.';
      return;
    } catch {
      // Continue to the selectable URL when clipboard permission is unavailable.
    }
  }
  revealShareUrl('Select and copy the draft question URL.');
});
