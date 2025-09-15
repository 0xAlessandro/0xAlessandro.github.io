// Decryption-style text animation inspired by shadcn's DecryptedText
// Usage:
//  - Add data-decrypt and optional data-text to any element.
//    <span data-decrypt data-text="0xAlessandro"></span>
//  - Or set the final text via element contents and omit data-text.
//  - Optional attributes: data-speed (ms), data-delay (ms), data-charset

(function () {
    const DEFAULT_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[]|:;\"',.<>/?~`";

    function randomChar(charset) {
        return charset[Math.floor(Math.random() * charset.length)];
    }

    function animateDecrypt(element, finalText, options) {
        const {
            stepDelay,
            startDelay,
            charset,
        } = options;

        const targetChars = Array.from(finalText);
        const totalSteps = Math.max(10, targetChars.length * 2);
        let step = 0;

        function renderFrame() {
            const output = targetChars.map((ch, idx) => {
                const revealAt = Math.floor((idx + 1) / targetChars.length * totalSteps);
                if (step >= revealAt) return ch;
                if (ch === ' ') return ' ';
                return randomChar(charset);
            }).join('');
            element.textContent = output;

            step++;
            if (step > totalSteps) {
                element.textContent = finalText;
                return;
            }
            window.setTimeout(renderFrame, stepDelay);
        }

        window.setTimeout(renderFrame, startDelay);
    }

    function initDecryptAnimations(root) {
        const nodes = (root || document).querySelectorAll('[data-decrypt]');
        if (!nodes || nodes.length === 0) return;

        nodes.forEach((el) => {
            const finalText = el.getAttribute('data-text') || el.textContent || '';
            const stepDelay = parseInt(el.getAttribute('data-speed') || '30', 10);
            const startDelay = parseInt(el.getAttribute('data-delay') || '0', 10);
            const charset = (el.getAttribute('data-charset') || DEFAULT_CHARSET);

            // Prevent double-running
            if (el.__decryptInitialized) return;
            el.__decryptInitialized = true;

            // Respect reduced motion preferences
            try {
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    el.textContent = finalText;
                    return;
                }
            } catch (e) { /* no-op */ }

            animateDecrypt(el, finalText, { stepDelay, startDelay, charset });
        });
    }

    // Run after overlay completes if present; otherwise on DOM ready
    function run() { initDecryptAnimations(document); }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            if (typeof window !== 'undefined') {
                const overlay = document.getElementById('decrypt-overlay');
                if (overlay) {
                    let ran = false;
                    const kick = () => { if (!ran) { ran = true; run(); } };
                    window.addEventListener('decrypt-overlay:done', kick, { once: true });
                    // Fallback in case overlay is disabled or hidden quickly
                    setTimeout(kick, 2200);
                } else {
                    run();
                }
            } else {
                run();
            }
        });
    } else {
        run();
    }

    // If the theme does any PJAX-like navigation in the future, expose a hook
    window.__initDecryptAnimations = initDecryptAnimations;
})();


