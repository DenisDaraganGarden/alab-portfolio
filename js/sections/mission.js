/**
 * Mission Section Module
 */

export const initMission = (container) => {
    if (!container || typeof gsap === 'undefined') return;
    
    const title = container.querySelector('.mission-title');
    const text = container.querySelector('.mission-text');
    const footer = container.querySelector('.mission-footer');

    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: container,
            start: 'top 70%',
            toggleActions: 'play none none none'
        }
    });

    tl.from(title, {
        opacity: 0,
        x: -40,
        duration: 1.2,
        ease: 'expo.out'
    })
    .from(text, {
        opacity: 0,
        y: 20,
        filter: 'blur(10px)',
        duration: 1.5,
        ease: 'power3.out'
    }, "-=0.8")
    .from(footer, {
        opacity: 0,
        y: 10,
        duration: 1,
        ease: 'power2.out'
    }, "-=1.2");
};
