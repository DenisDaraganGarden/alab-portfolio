/**
 * Profile Section Module
 */

export const initProfile = (container) => {
    if (!container || typeof gsap === 'undefined') return;
    
    const heading = container.querySelector('.profile-quote-heading');
    const quote = container.querySelector('.profile-quote');
    const services = container.querySelectorAll('.profile-services li');
    const author = container.querySelector('.author-info');
    const imageContainer = container.querySelector('.profile-image-container');

    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: container,
            start: 'top 70%',
            toggleActions: 'play none none none'
        }
    });

    tl.from(heading, {
        opacity: 0,
        y: 40,
        duration: 1.2,
        ease: 'power4.out'
    })
    .from(author, {
        opacity: 0,
        y: 20,
        duration: 1,
        ease: 'power3.out'
    }, "-=1.0")
    .from(quote, {
        opacity: 0,
        y: 20,
        duration: 1,
        ease: 'power2.out'
    }, "-=0.8")
    .from(imageContainer, {
        opacity: 0,
        y: 30,
        scale: 1.05,
        duration: 1.5,
        ease: 'expo.out'
    }, "-=1.2")
    .from(services, {
        opacity: 0,
        y: 10,
        stagger: 0.05,
        duration: 0.6,
        ease: 'power2.out'
    }, "-=1.0");
};
