document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.container.content');
  if (!container) return;

  function scrollToHash(hash) {
    if (!hash || hash.length < 2) return;
    const id = decodeURIComponent(hash.slice(1));
    const el = container.querySelector(`#${CSS.escape(id)}`) || document.getElementById(id);
    if (!el) return;
    const cRect = container.getBoundingClientRect();
    const tRect = el.getBoundingClientRect();
    const top = tRect.top - cRect.top + container.scrollTop - 8;
    container.scrollTo({ top, behavior: 'auto' });
  }

  if (location.hash) {
    setTimeout(() => scrollToHash(location.hash), 0);
  }
  window.addEventListener('hashchange', () => scrollToHash(location.hash));
});
