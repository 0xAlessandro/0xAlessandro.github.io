(function () {
    // Larger charset for more variety
    const DEFAULT_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[]|:;\"',.<>/?~`";

    function randomChar(charset) {
        return charset[Math.floor(Math.random() * charset.length)];
    }

    // requestAnimationFrame-driven, per-character reveal with periodic scrambling
    function animateText(targetEl, finalText, durationMs, scrambleEveryMs, charset) {
        const startTime = performance.now();
        const chars = Array.from(finalText);
        const lastScrambleChars = new Array(chars.length);
        let lastScrambleTime = startTime - scrambleEveryMs;

        return new Promise((resolve) => {
            function tick(now) {
                const elapsed = now - startTime;
                const progress = Math.min(1, elapsed / durationMs);
                const revealCount = Math.floor(progress * chars.length);
                const shouldScramble = (now - lastScrambleTime) >= scrambleEveryMs;

                let output = '';
                for (let i = 0; i < chars.length; i++) {
                    if (i < revealCount) {
                        output += chars[i];
                        lastScrambleChars[i] = chars[i];
                    } else {
                        if (chars[i] === ' ') {
                            output += ' ';
                            lastScrambleChars[i] = ' ';
                        } else {
                            if (shouldScramble || !lastScrambleChars[i]) {
                                lastScrambleChars[i] = randomChar(charset);
                            }
                            output += lastScrambleChars[i];
                        }
                    }
                }

                if (shouldScramble) {
                    lastScrambleTime = now;
                }

                targetEl.textContent = output;

                if (progress < 1) {
                    requestAnimationFrame(tick);
                } else {
                    targetEl.textContent = finalText;
                    // Tiny extra hold at end for perceived smoothness
                    setTimeout(resolve, 10);
                }
            }
            requestAnimationFrame(tick);
        });
    }

    async function runOverlay() {
        const overlay = document.getElementById('decrypt-overlay');
        const textEl = document.getElementById('decrypt-overlay-text');
        if (!overlay || !textEl) return;

        // Read configuration from data attributes on <html> or fallback defaults
        const root = document.documentElement;
        const text = root.getAttribute('data-decrypt-overlay-text') || 'ACCESS GRANTED';
        const duration = parseInt(root.getAttribute('data-decrypt-overlay-duration') || '1200', 10); // quicker default
        const scrambleEvery = parseInt(root.getAttribute('data-decrypt-overlay-step') || '22', 10);
        const charset = root.getAttribute('data-decrypt-overlay-charset') || DEFAULT_CHARSET;

        // Respect reduced motion
        try {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                return;
            }
        } catch (e) { /* noop */ }

        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');

        await animateText(textEl, text, duration, scrambleEvery, charset);

        // Fade out (CSS handles smooth transition)
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');

        // Signal other scripts that overlay finished
        const evt = new CustomEvent('decrypt-overlay:done');
        window.dispatchEvent(evt);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runOverlay);
    } else {
        runOverlay();
    }

    window.__runDecryptOverlay = runOverlay;
})();


