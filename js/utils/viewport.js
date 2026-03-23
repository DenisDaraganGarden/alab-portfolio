const MOBILE_BREAKPOINT = 900;
const MOBILE_CHROME_RESIZE_DELTA = 120;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const initViewportMetrics = () => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const coarsePointerQuery = window.matchMedia?.('(pointer: coarse)');
    let rafId = 0;
    let lastWidth = 0;
    let lastHeight = 0;

    const isTouchLikeViewport = (width) => (
        coarsePointerQuery?.matches
        || width <= MOBILE_BREAKPOINT
    );

    const shouldIgnoreViewportResize = (width, height) => {
        if (!lastWidth || !lastHeight) return false;
        if (!isTouchLikeViewport(width)) return false;

        const widthDelta = Math.abs(width - lastWidth);
        const heightDelta = Math.abs(height - lastHeight);

        return widthDelta < 8 && heightDelta > 0 && heightDelta < MOBILE_CHROME_RESIZE_DELTA;
    };

    const updateMetrics = (force = false) => {
        rafId = 0;

        const width = Math.round(window.innerWidth || document.documentElement.clientWidth || 0);
        const height = Math.round(window.innerHeight || document.documentElement.clientHeight || 0);

        if (!force && shouldIgnoreViewportResize(width, height)) {
            return;
        }

        const gutter = width <= MOBILE_BREAKPOINT
            ? clamp(width * 0.051, 18, 28)
            : clamp(width * 0.05, 28, 72);

        const sectionSpace = width <= MOBILE_BREAKPOINT
            ? clamp(width * 0.082, 24, 42)
            : clamp(width * 0.06, 36, 96);

        root.style.setProperty('--app-width', `${width}px`);
        root.style.setProperty('--app-height', `${height * 0.01}px`);
        root.style.setProperty('--page-gutter', `${gutter}px`);
        root.style.setProperty('--page-section-space', `${sectionSpace}px`);

        lastWidth = width;
        lastHeight = height;
    };

    const requestUpdate = (force = false) => {
        if (rafId) return;
        rafId = window.requestAnimationFrame(() => updateMetrics(force));
    };

    updateMetrics(true);

    window.addEventListener('resize', () => requestUpdate(false), { passive: true });
    window.addEventListener('orientationchange', () => requestUpdate(true), { passive: true });
};
