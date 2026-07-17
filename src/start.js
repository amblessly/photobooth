import { startThemeCycle } from './theme-cycle.js';

const USERNAME_KEY = 'snapcrate:username';

function sanitize(name) {
  return name.replace(/\s+/g, ' ').trim().slice(0, 24);
}

function renderBgDecor(container) {
  if (!container || container.childElementCount) return;
  const shapes = [
    { top: '8%', left: '4%', size: 70, color: 'var(--accent-soft)', delay: '0s' },
    { top: '70%', left: '8%', size: 50, color: 'var(--mint-soft)', delay: '2s' },
    { top: '20%', left: '90%', size: 90, color: 'var(--butter-soft)', delay: '1s' },
    { top: '78%', left: '85%', size: 60, color: 'var(--sky-soft)', delay: '3s' },
    { top: '45%', left: '50%', size: 40, color: 'var(--accent-soft)', delay: '1.5s' },
  ];
  shapes.forEach((s) => {
    const span = document.createElement('span');
    span.style.top = s.top;
    span.style.left = s.left;
    span.style.width = s.size + 'px';
    span.style.height = s.size + 'px';
    span.style.background = s.color;
    span.style.animationDelay = s.delay;
    container.appendChild(span);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('usernameForm');
  const input = document.getElementById('usernameInput');
  const error = document.getElementById('usernameError');

  renderBgDecor(document.getElementById('bgDecor'));
  startThemeCycle();

  const existing = localStorage.getItem(USERNAME_KEY);
  if (existing) input.value = existing;

  input.addEventListener('input', () => {
    if (!error.hidden && input.value.trim()) error.hidden = true;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = sanitize(input.value);
    if (!name) {
      error.hidden = false;
      input.focus();
      return;
    }
    try {
      localStorage.setItem(USERNAME_KEY, name);
    } catch (_) {
      /* localStorage unavailable — proceed anyway with a session name */
    }
    window.location.href = '/booth';
  });

  input.focus();
});
