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
const demoBanner = document.querySelector('.demo-banner');

function demoUnavailable() {
  document.documentElement.dataset.demoState = 'unavailable';
  if (demoBanner) demoBanner.replaceChildren(...[
    Object.assign(document.createElement('strong'), { textContent: 'DEMO DATA UNAVAILABLE' }),
    Object.assign(document.createElement('span'), { textContent: 'Illustrative sample values could not be loaded. No live or sample values are shown.' }),
  ]);
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

  const ledger = document.querySelector('[data-demo-ledger]');
  if (ledger) {
    const rows = [...ledger.querySelectorAll('tbody tr')];
    payload.headline.views.forEach((view, index) => {
      const cells = rows[index]?.querySelectorAll('td');
      if (!cells?.length) return;
      cells[0].textContent = `${view.yes}% YES / ${view.no}% NO`;
      cells[1].textContent = `DEMO · ${view.status}`;
    });
    ledger.setAttribute('data-demo', 'true');
  }

  const cardsById = new Map([...document.querySelectorAll('.motion-card[data-question-id]')]
    .map((card) => [card.dataset.questionId, card]));
  payload.questions.forEach((question) => {
    const card = cardsById.get(question.displayId);
    if (!card) return;
    card.dataset.demo = 'true';
    const link = card.querySelector('.motion-card-link');
    if (!link || link.querySelector('.demo-card-aggregate')) return;
    const aggregate = document.createElement('p');
    aggregate.className = 'demo-card-aggregate';
    aggregate.textContent = `DEMO · ${question.yes}% YES / ${question.no}% NO · ${question.status}`;
    link.append(aggregate);
  });
}

fetch('/api/demo-state', { cache: 'no-store' })
  .then(async (response) => {
    if (response.status === 404) return null; // Demo mode is not enabled for this deployment; nothing to present.
    if (!response.ok) throw new Error('Demo unavailable');
    return response.json();
  })
  .then((payload) => { if (payload) renderDemoState(payload); })
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
const questionRail = document.querySelector('.question-rail');
const questionRailControls = document.querySelector('[data-question-rail-controls]');
const questionPrevious = document.querySelector('[data-question-previous]');
const questionNext = document.querySelector('[data-question-next]');
const questionPosition = document.querySelector('#question-position');
const cardExpansion = matchMedia('(min-width: 701px)');
let expandedCard = null;
let returnFocusAfterHistoryClose = false;
let questionRailIndex = 0;
let questionRailScrollTimer = null;
questionRows.forEach((row, index) => { row.id = `question-${String(index + 1).padStart(2, '0')}`; });

function setQuestionRailPosition(index) {
  questionRailIndex = Math.min(Math.max(index, 0), motionCards.length - 1);
  if (questionPosition) questionPosition.textContent = `Question ${questionRailIndex + 1} of ${motionCards.length}`;
  if (questionPrevious) questionPrevious.disabled = questionRailIndex === 0;
  if (questionNext) questionNext.disabled = questionRailIndex === motionCards.length - 1;
}

function nearestQuestionRailIndex() {
  if (!questionRail) return 0;
  const viewportCenter = questionRail.scrollLeft + questionRail.clientWidth / 2;
  return motionCards.reduce((nearest, card, index) => {
    const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - viewportCenter);
    return distance < nearest.distance ? { index, distance } : nearest;
  }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
}

function updateQuestionRailFromScroll() {
  setQuestionRailPosition(nearestQuestionRailIndex());
}

function scrollToQuestion(index) {
  const targetIndex = Math.min(Math.max(index, 0), motionCards.length - 1);
  setQuestionRailPosition(targetIndex);
  const target = motionCards[targetIndex];
  if (!questionRail || !target) return;
  const inlinePadding = Number.parseFloat(getComputedStyle(questionRail).paddingInlineStart) || 0;
  questionRail.scrollTo({
    left: Math.max(target.offsetLeft - inlinePadding, 0),
    behavior: reducedMotion.matches ? 'auto' : 'smooth',
  });
}

function updateQuestionRailControls() {
  if (!questionRailControls) return;
  const mobile = !cardExpansion.matches;
  questionRailControls.hidden = !mobile;
  if (!mobile) {
    clearTimeout(questionRailScrollTimer);
    questionRailScrollTimer = null;
    return;
  }
  requestAnimationFrame(updateQuestionRailFromScroll);
}

questionPrevious?.addEventListener('click', () => scrollToQuestion(questionRailIndex - 1));
questionNext?.addEventListener('click', () => scrollToQuestion(questionRailIndex + 1));
questionRail?.addEventListener('focusin', (event) => {
  const card = event.target.closest('.motion-card');
  const index = motionCards.indexOf(card);
  if (index >= 0) setQuestionRailPosition(index);
});
questionRail?.addEventListener('scroll', () => {
  clearTimeout(questionRailScrollTimer);
  questionRailScrollTimer = setTimeout(updateQuestionRailFromScroll, 100);
}, { passive: true });
updateQuestionRailControls();

function questionFragment(card) {
  return card?.querySelector('.motion-card-link')?.hash || '';
}

function cardForFragment(fragment) {
  return motionCards.find((card) => questionFragment(card) === fragment) || null;
}

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
  if (cardExpansion.matches) {
    const railCenter = rail.getBoundingClientRect().left + rail.getBoundingClientRect().width / 2;
    motionCards.forEach((neighbor) => {
      if (neighbor === card) return;
      const rect = neighbor.getBoundingClientRect();
      neighbor.style.setProperty('--card-shift', rect.left + rect.width / 2 < railCenter ? '-420px' : '420px');
    });
  }
  const context = createCardContext(card);
  const link = card.querySelector('.motion-card-link');
  rail.classList.add('has-expanded');
  card.classList.add('is-expanded');
  card.append(context);
  link.setAttribute('aria-expanded', 'true');
  link.setAttribute('aria-controls', context.id);
  const cue = link.querySelector('.card-open-cue');
  if (cue) cue.textContent = 'Context open';
  context.querySelector('[data-card-close]').addEventListener('click', () => closeQuestionContext(card, true));
  expandedCard = card;
  if (!cardExpansion.matches) {
    requestAnimationFrame(() => {
      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, window.scrollY + context.getBoundingClientRect().top - 76);
      root.style.scrollBehavior = previousScrollBehavior;
    });
  }
}

function closeQuestionContext(card = expandedCard, returnFocus = false) {
  if (!card) return;
  const fragment = questionFragment(card);
  if (location.hash === fragment) {
    if (history.state?.heQuestionContext === fragment) {
      returnFocusAfterHistoryClose = returnFocus;
      history.back();
      return;
    }
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  }
  collapseCard(card, returnFocus);
}

function syncQuestionContextFromLocation() {
  const card = cardForFragment(location.hash);
  if (card) {
    const disclosure = document.querySelector(location.hash)?.querySelector('details');
    if (disclosure) disclosure.open = true;
    if (expandedCard !== card) expandCard(card);
    returnFocusAfterHistoryClose = false;
    return;
  }
  if (expandedCard) collapseCard(expandedCard, returnFocusAfterHistoryClose);
  returnFocusAfterHistoryClose = false;
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
    event.preventDefault();
    if (card.classList.contains('is-expanded')) {
      closeQuestionContext(card, true);
      return;
    }
    expandCard(card);
    const state = history.state && typeof history.state === 'object' ? history.state : {};
    history.pushState({ ...state, heQuestionContext: link.hash }, '', link.hash);
  });
});
window.addEventListener('popstate', syncQuestionContextFromLocation);
window.addEventListener('hashchange', syncQuestionContextFromLocation);
syncQuestionContextFromLocation();
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && expandedCard) closeQuestionContext(expandedCard, true);
});
cardExpansion.addEventListener?.('change', () => {
  updateQuestionRailControls();
  if (!expandedCard) return;
  const card = expandedCard;
  collapseCard(card);
  expandCard(card);
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
