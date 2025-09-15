document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('backToTop');
    if (!btn) return;
    const container = document.querySelector('.container.content');
    if (!container) return;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        container.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Circular progress ring based on container scroll
    const ring = btn.querySelector('.ring .ring-fg');
    if (ring) {
        const radius = 16; // approximate
        const circumference = 2 * Math.PI * radius;
        ring.style.strokeDasharray = `${circumference} ${circumference}`;
        const update = () => {
            const max = container.scrollHeight - container.clientHeight;
            const ratio = max > 0 ? (container.scrollTop / max) : 0;
            const offset = circumference - ratio * circumference;
            ring.style.strokeDashoffset = `${offset}`;
        };
        container.addEventListener('scroll', update, { passive: true });
        update();
    }
});
