const MOBILE_BREAKPOINT = 900;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const initViewportMetrics = () => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    let rafId = 0;

    const updateMetrics = () => {
        rafId = 0;

        const viewport = window.visualViewport;
        const width = Math.round(viewport?.width ?? window.innerWidth);
        const height = Math.round(viewport?.height ?? window.innerHeight);

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
    };

    const requestUpdate = () => {
        if (rafId) return;
        rafId = window.requestAnimationFrame(updateMetrics);
    };

    updateMetrics();

    window.addEventListener('resize', requestUpdate, { passive: true });
    window.addEventListener('orientationchange', requestUpdate, { passive: true });
    window.visualViewport?.addEventListener('resize', requestUpdate, { passive: true });
    window.visualViewport?.addEventListener('scroll', requestUpdate, { passive: true });
};
