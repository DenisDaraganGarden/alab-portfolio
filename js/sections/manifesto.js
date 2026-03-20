import { splitText } from '../utils/split.js';

/**
 * Manifesto Section Module
 */

export const initManifesto = (container) => {
    if (!container) return;
    const p = container.querySelector('.manifesto-text');
    if (!p) return;

    // Split text into characters for beautiful animation
    splitText(p, 'chars');
    const chars = p.querySelectorAll('.char');

    if (typeof gsap !== 'undefined') {
        gsap.set(chars, { opacity: 0, y: 20 });
        
        gsap.to(chars, {
            scrollTrigger: {
                trigger: container,
                start: 'top 70%',
                toggleActions: 'play none none none'
            },
            opacity: 1,
            y: 0,
            duration: 0.8,
            stagger: 0.02,
            ease: 'power4.out'
        });
    }
};
