/**
 * Hero Section Module
 * Handles entry animations for the main landing area.
 */

export const initHero = (container) => {
    if (!container) return;
    const title = container.querySelector('.hero-title');
    const subtitle = container.querySelector('.hero-subtitle');

    if (typeof gsap !== 'undefined') {
        gsap.from([title, subtitle], {
            y: 50,
            opacity: 0,
            duration: 1.5,
            stagger: 0.2,
            ease: 'power4.out',
            delay: 0.5
        });
    }
};
