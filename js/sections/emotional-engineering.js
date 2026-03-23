/**
 * Emotional Engineering Section
 *
 * Desktop keeps the pinned reveal scene.
 * Mobile switches to a natural document flow without pinned spacer gaps.
 */

const MOBILE_BREAKPOINT = 900;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getBaseOpacity = (element) => {
    const cached = Number(element.dataset.baseOpacity);
    if (!Number.isNaN(cached) && cached > 0) return cached;

    const computed = parseFloat(window.getComputedStyle(element).opacity || '1');
    const resolved = Number.isFinite(computed) ? computed : 1;
    element.dataset.baseOpacity = String(resolved);

    return resolved;
};

export const initEmotionalEngineering = (container) => {
    if (!container || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    const titleWrapper = container.querySelector('.ee-title-wrapper');
    const columns = [...container.querySelectorAll('.ee-column')];
    const arrows = [...container.querySelectorAll('.ee-arrow')];
    const revealElements = [
        titleWrapper,
        ...columns,
        ...arrows
    ].filter(Boolean);

    if (!revealElements.length) return;

    revealElements.forEach((element) => {
        getBaseOpacity(element);
    });

    const isMobileLayout = () => window.innerWidth <= MOBILE_BREAKPOINT;
    let cleanupScene = null;

    const clearRevealState = () => {
        gsap.set(revealElements, {
            clearProps: 'transform,opacity,filter'
        });
    };

    const mountMobileScene = () => {
        clearRevealState();

        const revealTween = gsap.fromTo(
            revealElements,
            {
                y: 28,
                scale: 0.985,
                filter: 'blur(10px)',
                opacity: (index, element) => clamp(getBaseOpacity(element) * 0.2, 0.14, 0.35)
            },
            {
                y: 0,
                scale: 1,
                filter: 'blur(0px)',
                opacity: (index, element) => getBaseOpacity(element),
                duration: 0.95,
                ease: 'power2.out',
                stagger: 0.08,
                immediateRender: false,
                scrollTrigger: {
                    trigger: container,
                    start: 'top 78%',
                    once: true
                }
            }
        );

        return () => {
            revealTween.scrollTrigger?.kill();
            revealTween.kill();
            clearRevealState();
        };
    };

    const mountDesktopScene = () => {
        clearRevealState();

        const revealTween = gsap.fromTo(
            revealElements,
            {
                x: (index, element) => {
                    if (element === titleWrapper) return -28;
                    return 0;
                },
                y: (index, element) => {
                    if (element === titleWrapper) return 34;
                    if (arrows.includes(element)) return 18;
                    return 28;
                },
                scale: (index, element) => element === titleWrapper ? 0.975 : 0.985,
                filter: 'blur(10px)',
                opacity: (index, element) => clamp(getBaseOpacity(element) * 0.18, 0.1, 0.28)
            },
            {
                x: 0,
                y: 0,
                scale: 1,
                filter: 'blur(0px)',
                opacity: (index, element) => getBaseOpacity(element),
                ease: 'none',
                stagger: 0.08,
                immediateRender: false,
                scrollTrigger: {
                    trigger: container,
                    start: 'top top',
                    end: '+=1500',
                    scrub: 1,
                    pin: true,
                    anticipatePin: 1,
                    invalidateOnRefresh: true
                }
            }
        );

        return () => {
            revealTween.scrollTrigger?.kill();
            revealTween.kill();
            clearRevealState();
        };
    };

    const updateSceneMode = () => {
        cleanupScene?.();
        cleanupScene = isMobileLayout() ? mountMobileScene() : mountDesktopScene();
    };

    updateSceneMode();

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handleModeChange = () => updateSceneMode();

    if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleModeChange);
    } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(handleModeChange);
    }
};
