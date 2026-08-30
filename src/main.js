const forecastChoices = [...document.querySelectorAll('input[name="private-forecast"]')];
const reset = document.querySelector('#reset-forecast');
const menuButton = document.querySelector('.menu-button');
const menu = document.querySelector('#menu');
const shareButton = document.querySelector('#share-forecast');
const shareStatus = document.querySelector('#share-status');
const shareFallback = document.querySelector('#share-fallback');
const shareUrl = document.querySelector('#share-url');

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
  url: document.querySelector('link[rel="canonical"]').href,
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
