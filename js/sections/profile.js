/**
 * Profile Section Module
 */

export const initProfile = (container) => {
    if (!container || typeof gsap === 'undefined') return;
    
    const heading = container.querySelector('.profile-quote-heading');
    const quote = container.querySelector('.profile-quote');
    const services = container.querySelectorAll('.profile-services li');
    const author = container.querySelector('.author-info');
    const imageWrapper = container.querySelector('.profile-image-wrapper');
    const imageContainer = container.querySelector('.profile-image-container');
    const imagePicture = container.querySelector('.profile-image-picture');
    const imageImg = container.querySelector('.profile-image');
    const imageGlow = container.querySelector('.profile-image-glow');

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
        scale: 0.8,
        opacity: 0,
        rotation: -5,
        duration: 1.5,
        ease: 'expo.out'
    }, "-=1.2")
    .fromTo(imageImg, {
        clipPath: 'polygon(0 100%, 100% 100%, 100% 100%, 0 100%)',
        opacity: 0,
        scale: 1.1
    }, {
        clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
        opacity: 1,
        scale: 1,
        duration: 1.5,
        ease: 'power3.out'
    }, "<")
    .from(imagePicture, {
        scale: 1.2,
        duration: 2,
        ease: 'power2.out'
    }, "<")
    .from(services, {
        opacity: 0,
        y: 10,
        stagger: 0.05,
        duration: 0.6,
        ease: 'power2.out'
    }, "-=1.0");

    // Continuous Floating Animation (Subtle Breathing Effect)
    if (imageContainer) {
        gsap.to(imageContainer, {
            y: "-=8",
            rotation: 0.5,
            duration: 6,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut"
        });

        if (imageGlow) {
            gsap.to(imageGlow, {
                scale: 1.2,
                opacity: 0.5,
                duration: 5,
                repeat: -1,
                yoyo: true,
                ease: "sine.inOut"
            });
        }
    }

    // Interactive 3D Tilt & Parallax
    if (imageWrapper && imageContainer) {
        imageWrapper.addEventListener('mousemove', (e) => {
            const rect = imageWrapper.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            
            // Tilt the container
            gsap.to(imageContainer, {
                rotationY: x * 12,
                rotationX: -y * 12,
                x: x * 10,
                y: y * 5,
                duration: 0.6,
                ease: 'power2.out',
                overwrite: 'auto'
            });

            // Move glow opposite to tilt for depth
            if (imageGlow) {
                gsap.to(imageGlow, {
                    x: x * -40,
                    y: y * -40,
                    duration: 0.8,
                    ease: 'power2.out',
                    overwrite: 'auto'
                });
            }
            
            // Move image inside (depth parallax)
            if (imageImg) {
                gsap.to(imageImg, {
                    x: x * 20,
                    y: y * 20,
                    duration: 0.8,
                    ease: 'power2.out',
                    overwrite: 'auto'
                });
            }
        });
        
        imageWrapper.addEventListener('mouseleave', () => {
            gsap.to([imageContainer, imageGlow, imageImg], {
                rotationY: 0,
                rotationX: 0,
                x: 0,
                y: 0,
                duration: 1.2,
                ease: 'elastic.out(1, 0.3)',
                overwrite: 'auto'
            });
        });
    }

    // Scroll-based parallax
    if (imagePicture && imageContainer) {
        gsap.to(imagePicture, {
            yPercent: 15,
            ease: "none",
            scrollTrigger: {
                trigger: imageContainer,
                start: "top bottom",
                end: "bottom top",
                scrub: true
            }
        });
    }
};
