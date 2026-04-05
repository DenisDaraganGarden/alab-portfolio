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
    const ovalBody = container.querySelector('.profile-oval-body');
    const ovalSpecular = container.querySelectorAll('.profile-oval-specular');

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
    .from(ovalBody, {
        opacity: 0,
        scale: 0.94,
        duration: 1.5,
        ease: 'power3.out'
    }, "<")
    .from(ovalSpecular, {
        opacity: 0,
        x: 14,
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
    if (imageWrapper) {
        gsap.to(imageWrapper, {
            y: "-=8",
            rotation: 0.5,
            duration: 6,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut"
        });
    }

    // Interactive 3D Tilt & Glass Refraction
    if (imageWrapper && imageContainer) {
        const defaults = {
            '--oval-tilt-x': '0deg',
            '--oval-tilt-y': '0deg',
            '--oval-shift-x': '0px',
            '--oval-shift-y': '0px',
            '--oval-light-x': '74%',
            '--oval-light-y': '24%',
            '--oval-glow-shift-x': '0px',
            '--oval-glow-shift-y': '0px',
            '--oval-glow-opacity': '0.34',
            '--oval-shadow-opacity': '0.22',
            '--oval-sheen-opacity': '0.88',
            '--oval-specular-shift-x': '0px',
            '--oval-specular-shift-y': '0px'
        };

        Object.entries(defaults).forEach(([name, value]) => {
            imageWrapper.style.setProperty(name, value);
        });

        const varTo = (name, duration, ease) => gsap.quickTo(imageWrapper, name, { duration, ease });
        const setters = {
            tiltX: varTo('--oval-tilt-x', 0.9, 'power3.out'),
            tiltY: varTo('--oval-tilt-y', 0.9, 'power3.out'),
            shiftX: varTo('--oval-shift-x', 0.95, 'power3.out'),
            shiftY: varTo('--oval-shift-y', 0.95, 'power3.out'),
            lightX: varTo('--oval-light-x', 0.75, 'power3.out'),
            lightY: varTo('--oval-light-y', 0.75, 'power3.out'),
            glowShiftX: varTo('--oval-glow-shift-x', 1.0, 'power2.out'),
            glowShiftY: varTo('--oval-glow-shift-y', 1.0, 'power2.out'),
            glowOpacity: varTo('--oval-glow-opacity', 0.95, 'power2.out'),
            shadowOpacity: varTo('--oval-shadow-opacity', 0.95, 'power2.out'),
            sheenOpacity: varTo('--oval-sheen-opacity', 0.85, 'power2.out'),
            specularShiftX: varTo('--oval-specular-shift-x', 1.0, 'power2.out'),
            specularShiftY: varTo('--oval-specular-shift-y', 1.0, 'power2.out')
        };

        const applyLight = (normalizedX, normalizedY, pointerType = 'mouse') => {
            const amplitude = pointerType === 'touch' ? 0.7 : 1;
            const distance = Math.min(Math.hypot(normalizedX, normalizedY) / 0.72, 1);
            const lightX = 62 + (normalizedX * 38 * amplitude);
            const lightY = 28 + (normalizedY * 30 * amplitude);

            setters.tiltY(`${(normalizedX * 6.5 * amplitude).toFixed(2)}deg`);
            setters.tiltX(`${(-normalizedY * 6 * amplitude).toFixed(2)}deg`);
            setters.shiftX(`${(normalizedX * 4.5 * amplitude).toFixed(2)}px`);
            setters.shiftY(`${(normalizedY * 3.4 * amplitude).toFixed(2)}px`);
            setters.lightX(`${lightX.toFixed(2)}%`);
            setters.lightY(`${lightY.toFixed(2)}%`);
            setters.glowShiftX(`${(normalizedX * 38 * amplitude).toFixed(2)}px`);
            setters.glowShiftY(`${(normalizedY * 24 * amplitude).toFixed(2)}px`);
            setters.glowOpacity((0.28 + (distance * 0.18 * amplitude)).toFixed(3));
            setters.shadowOpacity((0.2 + (Math.max(0, normalizedY) * 0.08) + (distance * 0.04)).toFixed(3));
            setters.sheenOpacity((0.78 + (Math.max(0, normalizedX) * 0.18) + (Math.max(0, -normalizedY) * 0.08)).toFixed(3));
            setters.specularShiftX(`${(normalizedX * 10 * amplitude).toFixed(2)}px`);
            setters.specularShiftY(`${(normalizedY * 6 * amplitude).toFixed(2)}px`);
        };

        const resetLight = () => {
            setters.tiltX(defaults['--oval-tilt-x']);
            setters.tiltY(defaults['--oval-tilt-y']);
            setters.shiftX(defaults['--oval-shift-x']);
            setters.shiftY(defaults['--oval-shift-y']);
            setters.lightX(defaults['--oval-light-x']);
            setters.lightY(defaults['--oval-light-y']);
            setters.glowShiftX(defaults['--oval-glow-shift-x']);
            setters.glowShiftY(defaults['--oval-glow-shift-y']);
            setters.glowOpacity(defaults['--oval-glow-opacity']);
            setters.shadowOpacity(defaults['--oval-shadow-opacity']);
            setters.sheenOpacity(defaults['--oval-sheen-opacity']);
            setters.specularShiftX(defaults['--oval-specular-shift-x']);
            setters.specularShiftY(defaults['--oval-specular-shift-y']);
        };

        const updateFromPointer = (event) => {
            const rect = imageWrapper.getBoundingClientRect();
            const normalizedX = ((event.clientX - rect.left) / rect.width) - 0.5;
            const normalizedY = ((event.clientY - rect.top) / rect.height) - 0.5;
            applyLight(normalizedX, normalizedY, event.pointerType || 'mouse');
        };

        if ('PointerEvent' in window) {
            let touchActive = false;
            let touchResetCall = null;

            imageWrapper.addEventListener('pointerdown', (event) => {
                if (touchResetCall) {
                    touchResetCall.kill();
                    touchResetCall = null;
                }
                if (event.pointerType !== 'mouse') {
                    touchActive = true;
                }
                updateFromPointer(event);
            });

            imageWrapper.addEventListener('pointermove', (event) => {
                if (event.pointerType === 'mouse' || touchActive) {
                    updateFromPointer(event);
                }
            });

            imageWrapper.addEventListener('pointerleave', (event) => {
                if (event.pointerType === 'mouse') {
                    resetLight();
                }
            });

            const releaseTouch = () => {
                touchActive = false;
                if (touchResetCall) {
                    touchResetCall.kill();
                }
                touchResetCall = gsap.delayedCall(0.38, resetLight);
            };

            imageWrapper.addEventListener('pointerup', releaseTouch);
            imageWrapper.addEventListener('pointercancel', releaseTouch);
        } else {
            imageWrapper.addEventListener('mousemove', updateFromPointer);
            imageWrapper.addEventListener('mouseleave', resetLight);
        }
    }

    // Scroll-based parallax
    if (ovalBody && imageContainer) {
        gsap.to(ovalBody, {
            yPercent: 8,
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
