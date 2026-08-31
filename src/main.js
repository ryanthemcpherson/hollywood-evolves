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
selectInstrumentState('capture');

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
const questionRows = [...document.querySelectorAll('.season-ledger > li')];
const questionCalls = [...document.querySelectorAll('input[data-question-call]')];
questionRows.forEach((row, index) => { row.id = `question-${String(index + 1).padStart(2, '0')}`; });
questionCards.forEach((card) => card.addEventListener('click', () => {
  const row = document.querySelector(card.hash);
  const disclosure = row?.querySelector('details');
  if (disclosure) disclosure.open = true;
}));

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
