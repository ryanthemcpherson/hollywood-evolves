const slider = document.querySelector('#probability');
const output = document.querySelector('#probability-output');
const reset = document.querySelector('#reset-forecast');
const menuButton = document.querySelector('.menu-button');
const menu = document.querySelector('#menu');

const stored = Number.parseInt(localStorage.getItem('he-private-forecast') || '', 10);
if (Number.isInteger(stored) && stored >= 1 && stored <= 99) slider.value = stored;

function renderProbability() {
  output.value = `${slider.value}%`;
  slider.style.setProperty('--value', `${slider.value}%`);
}

slider.addEventListener('input', () => {
  localStorage.setItem('he-private-forecast', slider.value);
  renderProbability();
});
reset.addEventListener('click', () => {
  slider.value = 50;
  localStorage.removeItem('he-private-forecast');
  renderProbability();
  slider.focus();
});
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  menu.classList.toggle('open', !open);
});
menu.addEventListener('click', (event) => {
  if (event.target.matches('a')) {
    menuButton.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
  }
});
renderProbability();
