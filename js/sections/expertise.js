/**
 * Expertise Section Module
 */

export const initExpertise = (container) => {
    if (!container) return;
    const items = container.querySelectorAll('.expertise-item');

    if (typeof gsap !== 'undefined') {
        gsap.from(items, {
            scrollTrigger: {
                trigger: container,
                start: 'top 85%'
            },
            opacity: 0,
            y: 10,
            stagger: 0.1,
            duration: 0.5,
            ease: 'sine.out'
        });
    }
};
