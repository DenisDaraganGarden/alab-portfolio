/**
 * Verdetech Case Section Module
 * Handles scroll-based scaling for the case study header.
 */

export const initVerdetechCase = (container) => {
    if (!container) return;
    const header = container.querySelector('.header');

    if (typeof gsap !== 'undefined') {
        gsap.from(header, {
            scrollTrigger: {
                trigger: container,
                start: 'top bottom',
                end: 'bottom top',
                scrub: true
            },
            backgroundColor: 'rgba(0,0,0,0)',
            scale: 0.95,
            ease: 'none'
        });
    }
};
