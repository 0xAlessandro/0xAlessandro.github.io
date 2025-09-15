document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.querySelector('.article-toc-overlay');
    const container = document.querySelector('.container.content');
    if (!overlay || !container) return;

    overlay.addEventListener('click', (ev) => {
        const link = ev.target.closest('a[href^="#"]');
        if (!link) return;
        const raw = link.getAttribute('href');
        const id = decodeURIComponent(raw.slice(1));
        const sel = `#${CSS.escape(id)}`;
        const target = container.querySelector(sel) || document.querySelector(sel);
        if (!target) return;
        ev.preventDefault();

        const cRect = container.getBoundingClientRect();
        const tRect = target.getBoundingClientRect();
        const offset = tRect.top - cRect.top + container.scrollTop - 8;
        container.scrollTo({ top: offset, behavior: 'smooth' });

        try { history.replaceState(null, '', `#${encodeURIComponent(id)}`); } catch { }
    });
});


