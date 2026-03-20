/**
 * Contacts Section Module
 */

export const initContacts = (container) => {
    if (!container) return;
    const items = container.querySelectorAll('p, a');

    if (typeof gsap !== 'undefined') {
        gsap.from(items, {
            scrollTrigger: {
                trigger: container,
                start: 'top 90%'
            },
            opacity: 0,
            y: 20,
            duration: 0.8,
            ease: 'power2.out'
        });
    }
};
