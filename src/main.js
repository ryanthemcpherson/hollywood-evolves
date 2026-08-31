document.documentElement.classList.add('enhanced');

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
const cardExpansion = matchMedia('(min-width: 701px)');
let expandedCard = null;
questionRows.forEach((row, index) => { row.id = `question-${String(index + 1).padStart(2, '0')}`; });

function createCardContext(card) {
  const questionId = card.dataset.questionId;
  const context = document.createElement('section');
  const body = document.createElement('div');
  const close = document.createElement('button');
  context.className = 'card-context';
  context.id = `${questionId}-context`;
  context.setAttribute('aria-label', 'Full question context');
  close.type = 'button';
  close.dataset.cardClose = '';
  close.textContent = '× Close context';
  body.className = 'episode-frame card-context-body';

  const row = document.querySelector(`#${questionId}`);
  const source = row?.querySelector('.episode-frame');
  if (source) {
    [...source.children].forEach((child) => body.append(child.cloneNode(true)));
  } else {
    const question = document.querySelector('#forecast .question h3');
    const why = document.querySelector('#forecast .question p:has(strong)');
    const contract = document.querySelector('#forecast .contract dl');
    if (question) {
      const fullQuestion = document.createElement('p');
      fullQuestion.className = 'editorial-question';
      fullQuestion.textContent = question.textContent;
      body.append(fullQuestion);
    }
    if (why) body.append(why.cloneNode(true));
    if (contract) body.append(contract.cloneNode(true));
  }
  context.append(close, body);
  return context;
}

function collapseCard(card = expandedCard, returnFocus = false) {
  if (!card) return;
  const link = card.querySelector('.motion-card-link');
  card.classList.remove('is-expanded');
  card.querySelector('.card-context')?.remove();
  link.setAttribute('aria-expanded', 'false');
  link.removeAttribute('aria-controls');
  const cue = link.querySelector('.card-open-cue');
  if (cue) cue.textContent = 'Open full context →';
  card.parentElement.classList.remove('has-expanded');
  motionCards.forEach((neighbor) => neighbor.style.removeProperty('--card-shift'));
  expandedCard = null;
  if (returnFocus) link.focus();
}

function expandCard(card) {
  if (expandedCard && expandedCard !== card) collapseCard(expandedCard);
  const rail = card.parentElement;
  const railCenter = rail.getBoundingClientRect().left + rail.getBoundingClientRect().width / 2;
  motionCards.forEach((neighbor) => {
    if (neighbor === card) return;
    const rect = neighbor.getBoundingClientRect();
    neighbor.style.setProperty('--card-shift', rect.left + rect.width / 2 < railCenter ? '-420px' : '420px');
  });
  const context = createCardContext(card);
  const link = card.querySelector('.motion-card-link');
  rail.classList.add('has-expanded');
  card.classList.add('is-expanded');
  card.append(context);
  link.setAttribute('aria-expanded', 'true');
  link.setAttribute('aria-controls', context.id);
  const cue = link.querySelector('.card-open-cue');
  if (cue) cue.textContent = 'Context open';
  context.querySelector('[data-card-close]').addEventListener('click', () => collapseCard(card, true));
  expandedCard = card;
}

questionCards.forEach((link) => {
  link.setAttribute('aria-expanded', 'false');
  const cue = document.createElement('span');
  cue.className = 'card-open-cue';
  cue.setAttribute('aria-hidden', 'true');
  cue.textContent = 'Open full context →';
  link.append(cue);
  link.addEventListener('click', (event) => {
    const card = link.closest('.motion-card');
    const row = document.querySelector(link.hash);
    const disclosure = row?.querySelector('details');
    if (disclosure) disclosure.open = true;
    if (!cardExpansion.matches) return;
    event.preventDefault();
    if (card.classList.contains('is-expanded')) collapseCard(card, true);
    else expandCard(card);
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && expandedCard) collapseCard(expandedCard, true);
});
cardExpansion.addEventListener?.('change', (event) => {
  if (!event.matches) collapseCard();
});

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
  text: 'Consider the Episode 01 question about the future of ad-supported streaming plans.',
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
      shareStatus.textContent = 'Question URL copied.';
      return;
    } catch {
      // Continue to the selectable URL when clipboard permission is unavailable.
    }
  }
  revealShareUrl('Select and copy the question URL.');
});
