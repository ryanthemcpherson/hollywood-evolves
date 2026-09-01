document.documentElement.classList.add('enhanced');

const menuButton = document.querySelector('.menu-button');
const menu = document.querySelector('#menu');

function setMenu(open, returnFocus = false) {
  menuButton?.setAttribute('aria-expanded', String(open));
  menu?.classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open);
  if (!open && returnFocus) menuButton?.focus();
}

menuButton?.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
menu?.addEventListener('click', (event) => {
  if (!event.target.closest('a')) return;
  setMenu(false);
  const target = document.querySelector(event.target.closest('a').hash);
  if (target) requestAnimationFrame(() => { target.tabIndex = -1; target.focus({ preventScroll: true }); });
});
document.addEventListener('pointerdown', (event) => {
  if (menuButton?.getAttribute('aria-expanded') === 'true' && !event.target.closest('nav')) setMenu(false, true);
});

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* The local control still works. */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* No dependent state. */ } },
};

const forecastChoices = [...document.querySelectorAll('input[name="private-forecast"]')];
const storedForecast = storage.get('he-private-forecast');
if (storedForecast === 'yes' || storedForecast === 'no') {
  forecastChoices.find(({ value }) => value === storedForecast).checked = true;
} else if (storedForecast !== null) storage.remove('he-private-forecast');
forecastChoices.forEach((choice) => choice.addEventListener('change', () => storage.set('he-private-forecast', choice.value)));
document.querySelector('#reset-forecast')?.addEventListener('click', () => {
  forecastChoices.forEach((choice) => { choice.checked = false; });
  storage.remove('he-private-forecast');
  forecastChoices[0]?.focus();
});

const disclosures = [...document.querySelectorAll('.season-slate details')];
function fragmentElement() {
  if (!location.hash.startsWith('#') || location.hash.length === 1) return null;
  try {
    const id = decodeURIComponent(location.hash.slice(1));
    return id ? document.getElementById(id) : null;
  } catch { return null; }
}
function openFragment() {
  const item = fragmentElement();
  const disclosure = item?.matches('.season-slate > li[id]') ? item.querySelector('details') : null;
  if (disclosure) disclosure.open = true;
}
disclosures.forEach((details) => {
  const item = details.closest('li[id]');
  details.querySelector('summary')?.addEventListener('click', () => {
    if (item && location.hash !== `#${item.id}`) history.replaceState(history.state, '', `#${item.id}`);
  });
  details.addEventListener('toggle', () => {
    if (!details.open) return;
    document.querySelector('#share-forecast')?.setAttribute('data-share-url', canonicalShareUrl());
  });
});
window.addEventListener('hashchange', openFragment);
openFragment();

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (menuButton?.getAttribute('aria-expanded') === 'true') { setMenu(false, true); return; }
    const focusedDisclosure = document.activeElement?.closest?.('details');
    const opened = focusedDisclosure?.open ? focusedDisclosure : disclosures.findLast(({ open }) => open);
    if (opened) {
      opened.open = false;
      opened.querySelector('summary')?.focus();
      history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    }
  }
});

const shareButton = document.querySelector('#share-forecast');
const shareStatus = document.querySelector('#share-status');
const shareFallback = document.querySelector('#share-fallback');
const shareUrl = document.querySelector('#share-url');
function canonicalShareUrl() {
  try {
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    const url = new URL(canonical || location.href, location.href);
    const fragmentTarget = fragmentElement();
    const currentQuestion = fragmentTarget?.matches('#question-01.question-block, .season-slate > li[id]') ? fragmentTarget.id : null;
    const latestOpenQuestion = disclosures.findLast(({ open }) => open)?.closest('li[id]')?.id;
    url.hash = currentQuestion || latestOpenQuestion || 'question-01';
    return url.href;
  } catch { return location.href; }
}
shareButton?.setAttribute('data-share-url', canonicalShareUrl());
shareButton?.addEventListener('click', async () => {
  const data = { title: 'Hollywood Evolves — editorial question', text: 'Consider this Hollywood Evolves question about entertainment technology.', url: canonicalShareUrl() };
  shareFallback.hidden = true;
  shareStatus.textContent = '';
  if (typeof navigator.share === 'function') {
    try { await navigator.share(data); shareStatus.textContent = 'Sharing request completed.'; return; }
    catch (error) { if (error?.name === 'AbortError') { shareStatus.textContent = 'Sharing canceled.'; return; } }
  }
  if (typeof navigator.clipboard?.writeText === 'function') {
    try { await navigator.clipboard.writeText(data.url); shareStatus.textContent = 'Question URL copied.'; return; }
    catch { /* Offer the selectable URL below. */ }
  }
  shareFallback.hidden = false;
  shareUrl.value = data.url;
  shareUrl.focus();
  shareUrl.select();
  shareStatus.textContent = 'Select and copy the question URL.';
});
