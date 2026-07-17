const USERNAME_KEY = 'snapcrate:username';

const username = (() => {
  try {
    return localStorage.getItem(USERNAME_KEY);
  } catch (_) {
    return null;
  }
})();

if (username) {
  window.SNAPCRATE_USER = username;
  document.addEventListener('DOMContentLoaded', () => {
    const greeting = document.getElementById('brandGreeting');
    if (greeting) greeting.textContent = 'hi, ' + username;
  });
}
