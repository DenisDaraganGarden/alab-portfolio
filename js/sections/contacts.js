/**
 * Contacts Section Module
 */

export const initContacts = (container) => {
    if (!container) return;
    const items = container.querySelectorAll(
        '.contacts-kicker, .contacts-title, .contacts-note, .contacts-brand-mark, .contacts-card'
    );

    if (typeof gsap !== 'undefined') {
        gsap.from(items, {
            scrollTrigger: {
                trigger: container,
                start: 'top 80%'
            },
            opacity: 0,
            y: 28,
            stagger: 0.08,
            duration: 0.8,
            ease: 'power2.out'
        });
    }
};
