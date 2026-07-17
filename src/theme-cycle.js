const THEMES = ['cute', 'comic', 'anime', 'retro'];
const THEME_CYCLE_MS = 10000;

export function startThemeCycle() {
  let idx = THEMES.indexOf(document.body.dataset.theme);
  if (idx < 0) idx = 0;

  return setInterval(() => {
    idx = (idx + 1) % THEMES.length;
    document.body.dataset.theme = THEMES[idx];
  }, THEME_CYCLE_MS);
}
