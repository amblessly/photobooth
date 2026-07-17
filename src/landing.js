import { startThemeCycle } from './theme-cycle.js';

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
  renderBgDecor(document.getElementById('bgDecor'));
  startThemeCycle();

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});
