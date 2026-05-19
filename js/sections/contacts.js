/**
 * Contacts Section Module
 * Implements a reactive concave mirror form with "liquid" borders.
 */

const initDeveloperFooter = () => {
    const footer = document.querySelector('.site-footer');
    const tab = footer?.querySelector('.footer-liquid-tab');
    if (!footer || !tab || footer.dataset.footerReady === 'true') return;

    footer.dataset.footerReady = 'true';

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const setVar = (name, value) => footer.style.setProperty(name, value);
    const setFooterState = (open, tension) => {
        const contentOpacity = clamp(0.18 + (open * 0.82), 0.18, 1);
        const contentBlur = (1 - open) * 3.2;

        setVar('--footer-content-opacity', contentOpacity.toFixed(3));
        setVar('--footer-content-y', `${((1 - open) * 28) - (tension * 6)}px`);
        setVar('--footer-content-blur', `${contentBlur}px`);
        setVar('--footer-tab-y', `${-4 - (tension * 22)}px`);
        setVar('--footer-tab-scale-x', (1 + (tension * 0.62)).toFixed(3));
        setVar('--footer-tab-scale-y', (1 - (tension * 0.16)).toFixed(3));
        setVar('--footer-handle-scale', (1 + (tension * 0.75)).toFixed(3));
        setVar('--footer-neck-height', `${24 + (tension * 92)}px`);
        setVar('--footer-neck-opacity', clamp(0.16 + (open * 0.28) + (tension * 0.58), 0.16, 0.92).toFixed(3));
        setVar('--footer-glow-opacity', clamp(0.22 + (open * 0.42) + (tension * 0.28), 0.22, 0.92).toFixed(3));
        setVar('--footer-bg-y', `${(1 - open) * 22}px`);
        setVar('--footer-bg-scale-y', (0.9 + (open * 0.1) + (tension * 0.12)).toFixed(3));
    };

    let lastY = window.scrollY || window.pageYOffset || 0;
    let tension = 0;
    let targetTension = 0;
    let rafId = 0;
    let idleRafId = 0;
    let isDragging = false;
    let dragStartY = 0;
    let dragPull = 0;
    let dragReleaseTimer = 0;
    let pullProgress = 0;
    let pullGateOpen = false;
    let lastTouchY = 0;
    let tickerId = 0;

    const computeOpen = () => {
        const rect = footer.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
        const revealDistance = clamp(rect.height + 36, 260, 480);
        return clamp((viewportHeight - rect.top + 36) / revealDistance, 0, 1);
    };

    const render = () => {
        rafId = 0;
        const rect = footer.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
        const shouldDock = !pullGateOpen && rect.top < viewportHeight + 180 && rect.top > viewportHeight - 90;
        const open = Math.max(computeOpen(), pullProgress * 0.98);

        footer.dataset.footerDocked = shouldDock ? 'true' : 'false';
        tension += (targetTension - tension) * 0.28;
        setFooterState(open, clamp(tension + dragPull + (pullProgress * 0.7), 0, 1));
        footer.dataset.footerAwake = open > 0.02 || tension > 0.04 || dragPull > 0.03 || pullProgress > 0.03 ? 'true' : 'false';
    };

    const scheduleRender = () => {
        if (!rafId) rafId = window.requestAnimationFrame(render);
    };

    const relax = () => {
        targetTension *= 0.78;
        dragPull *= isDragging ? 1 : 0.82;

        if (!pullGateOpen) {
            pullProgress *= 0.9;
        }

        scheduleRender();

        if (Math.abs(targetTension) > 0.015 || Math.abs(tension) > 0.015 || dragPull > 0.015 || pullProgress > 0.015) {
            idleRafId = window.requestAnimationFrame(relax);
        } else {
            targetTension = 0;
            tension = 0;
            dragPull = 0;
            pullProgress = 0;
            idleRafId = 0;
            scheduleRender();
        }
    };

    const wakeRelax = () => {
        if (!idleRafId) idleRafId = window.requestAnimationFrame(relax);
    };

    const handleScroll = () => {
        const currentY = window.scrollY || window.pageYOffset || 0;
        const delta = currentY - lastY;
        const open = computeOpen();
        const speed = clamp(Math.abs(delta) / 72, 0, 1);
        const rect = footer.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;

        lastY = currentY;

        if (delta < -2 || rect.top > viewportHeight * 0.82) {
            pullGateOpen = false;
            pullProgress = Math.min(pullProgress, 0.16);
        }

        targetTension = Math.max(targetTension, speed * clamp(open + 0.24, 0, 1));
        scheduleRender();
        wakeRelax();
    };

    const tickFooterState = () => {
        const currentY = window.scrollY || window.pageYOffset || 0;
        const rect = footer.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
        const footerIsNear = rect.top < viewportHeight + 220 && rect.bottom > -80;
        const scrollChanged = Math.abs(currentY - lastY) > 0.5;
        const isActive = Math.abs(targetTension) > 0.015 || pullProgress > 0.015 || dragPull > 0.015;

        if (scrollChanged || footerIsNear || isActive) {
            handleScroll();
        }

        tickerId = window.requestAnimationFrame(tickFooterState);
    };

    const openFooter = () => {
        pullGateOpen = true;
        pullProgress = 1;
        targetTension = Math.max(targetTension, 0.9);
        scheduleRender();
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

        if (window.lenis?.scrollTo) {
            window.lenis.scrollTo(maxScroll, { duration: 0.9 });
        } else {
            window.scrollTo({ top: maxScroll, behavior: 'smooth' });
        }
    };

    const completePull = () => {
        if (dragPull < 0.22) return;
        openFooter();
    };

    const shouldIgnorePullTarget = (target) => {
        if (!(target instanceof Element)) return false;
        return Boolean(target.closest('input, textarea, select, button, a, .modal-scroll-area'));
    };

    const shouldCapturePull = (delta, target) => {
        if (delta <= 2 || pullGateOpen || shouldIgnorePullTarget(target)) return false;

        const rect = footer.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
        const footerIsAtGate = rect.top < viewportHeight + 170 && rect.bottom > viewportHeight;

        return footerIsAtGate && pullProgress < 1;
    };

    const absorbPull = (delta, event) => {
        if (!shouldCapturePull(delta, event.target)) return false;

        event.preventDefault();
        const increment = clamp(delta / 540, 0.018, 0.24);

        pullProgress = clamp(pullProgress + increment, 0, 1);
        targetTension = Math.max(targetTension, 0.34 + (pullProgress * 0.66));
        scheduleRender();

        if (pullProgress >= 0.98) {
            openFooter();
        } else {
            wakeRelax();
        }

        return true;
    };

    const handleWheel = (event) => {
        absorbPull(event.deltaY || 0, event);
    };

    const handleTouchStart = (event) => {
        lastTouchY = event.touches?.[0]?.clientY ?? 0;
    };

    const handleTouchMove = (event) => {
        const currentTouchY = event.touches?.[0]?.clientY ?? lastTouchY;
        const delta = lastTouchY - currentTouchY;
        lastTouchY = currentTouchY;
        absorbPull(delta, event);
    };

    const handlePointerDown = (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        window.clearTimeout(dragReleaseTimer);
        isDragging = true;
        dragStartY = event.clientY;
        dragPull = 0;
        footer.dataset.footerDragging = 'true';
        tab.setPointerCapture?.(event.pointerId);
        scheduleRender();
    };

    const handlePointerMove = (event) => {
        if (!isDragging) return;

        window.clearTimeout(dragReleaseTimer);
        const upwardPull = Math.max(0, dragStartY - event.clientY);
        dragPull = clamp(upwardPull / 118, 0, 1);
        targetTension = Math.max(targetTension, dragPull);
        scheduleRender();

        dragReleaseTimer = window.setTimeout(() => {
            isDragging = false;
            footer.dataset.footerDragging = 'false';
            wakeRelax();
        }, 700);
    };

    const handlePointerUp = (event = {}) => {
        if (!isDragging) return;

        window.clearTimeout(dragReleaseTimer);
        isDragging = false;
        footer.dataset.footerDragging = 'false';
        tab.releasePointerCapture?.(event.pointerId);
        completePull();
        wakeRelax();
    };

    setFooterState(0, 0);
    handleScroll();
    tickerId = window.requestAnimationFrame(tickFooterState);

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', scheduleRender, { passive: true });
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    tab.addEventListener('pointerdown', handlePointerDown);
    tab.addEventListener('pointermove', handlePointerMove);
    tab.addEventListener('pointerup', handlePointerUp);
    tab.addEventListener('pointercancel', handlePointerUp);
    tab.addEventListener('pointerleave', handlePointerUp);
    tab.addEventListener('lostpointercapture', handlePointerUp);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
};

export const initContacts = (container) => {
    if (!container) return;
    
    const items = container.querySelectorAll(
        '.contacts-kicker, .contacts-title, .contacts-note, .contacts-brand-mark'
    );
    const contactsCard = container.querySelector('.contacts-card');
    const morphLayer = container.querySelector('.morph-animation-layer');
    const morphWords = container.querySelectorAll('.morph-word');
    const morphBox = container.querySelector('.morph-box');

    const canAnimate = typeof gsap !== 'undefined';

    if (canAnimate && morphLayer && morphBox && contactsCard) {
        // Initial setup for morph sequence
        gsap.set(contactsCard, { opacity: 0, scale: 0.95, pointerEvents: 'none' });
        gsap.set(morphBox, { scale: 0.1, rotationZ: -45, opacity: 0 });
        
        morphWords.forEach((word, i) => {
            const angle = (i / morphWords.length) * Math.PI * 2;
            const radius = 100 + Math.random() * 50; 
            gsap.set(word, { 
                x: Math.cos(angle) * radius, 
                y: Math.sin(angle) * radius,
                opacity: 0,
                scale: 0.5
            });
        });

        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: container,
                start: 'top 70%'
            }
        });

        // 1. Box appears spinning
        tl.to(morphBox, {
            opacity: 1,
            scale: 1,
            rotationZ: 180,
            duration: 1.2,
            ease: "power3.inOut"
        }, 0)
        // Words appear floating around it
        .to(morphWords, {
            opacity: 1,
            scale: 1,
            duration: 0.6,
            stagger: 0.15,
            ease: "back.out(1.5)"
        }, "-=0.8")
        // 2. Words fly into the box
        .to(morphWords, {
            x: 0,
            y: 0,
            scale: 0,
            opacity: 0,
            duration: 0.5,
            stagger: 0.05,
            ease: "power4.in"
        }, "+=0.3")
        // Box pulses/spins up as it absorbs the words
        .to(morphBox, {
            rotationZ: 360,
            scale: 1.3,
            boxShadow: "0 0 40px 10px rgba(255,255,255,0.3)",
            duration: 0.4,
            ease: "power1.in"
        }, "-=0.3")
        // 3. The big morph wave
        .to(morphBox, {
            scale: 25,
            opacity: 0,
            duration: 0.8,
            ease: "power4.inOut"
        })
        // 4. Reveal the card and other elements
        .to(contactsCard, {
            opacity: 1,
            scale: 1,
            pointerEvents: 'auto',
            duration: 0.8,
            ease: "power3.out"
        }, "-=0.6")
        .from(items, {
            opacity: 0,
            y: 28,
            stagger: 0.1,
            duration: 0.8,
            ease: "power2.out"
        }, "-=0.6")
        .set(morphLayer, { display: 'none' });

    } else if (canAnimate) {
        gsap.from([...items, contactsCard], {
            scrollTrigger: {
                trigger: container,
                start: 'top 80%'
            },
            opacity: 0,
            y: 28,
            stagger: 0.1,
            duration: 0.8,
            ease: 'power2.out'
        });
    }

    // Reactive form glass logic
    const formContainer = container.querySelector('.reactive-form-container');
    if (!formContainer) return;

    initDeveloperFooter();

    const supportsFinePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
    const setGlassState = (state) => {
        formContainer.style.setProperty('--mx', state.mx);
        formContainer.style.setProperty('--my', state.my);
        formContainer.style.setProperty('--tilt-x', state.tiltX);
        formContainer.style.setProperty('--tilt-y', state.tiltY);
        formContainer.style.setProperty('--glass-edge-opacity', state.edgeOpacity);
    };

    const neutralGlassState = {
        mx: '50%',
        my: '42%',
        tiltX: '0deg',
        tiltY: '0deg',
        edgeOpacity: '0.48'
    };

    setGlassState(neutralGlassState);

    if (!supportsFinePointer || !canAnimate) {
        const form = container.querySelector('#contact-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const btn = form.querySelector('.submit-btn span');
                if (btn) btn.textContent = 'ОТПРАВЛЕНО';
                if (canAnimate) {
                    gsap.to(form, { opacity: 0.5, pointerEvents: 'none', duration: 0.4 });
                } else {
                    form.style.opacity = '0.5';
                    form.style.pointerEvents = 'none';
                }
                form.reset();
            });
        }
        return;
    }

    const setTiltX = gsap.quickTo(formContainer, '--tilt-x', { duration: 0.35, ease: 'power3.out' });
    const setTiltY = gsap.quickTo(formContainer, '--tilt-y', { duration: 0.35, ease: 'power3.out' });
    const setMx = gsap.quickTo(formContainer, '--mx', { duration: 0.42, ease: 'power3.out' });
    const setMy = gsap.quickTo(formContainer, '--my', { duration: 0.42, ease: 'power3.out' });
    const setEdgeOpacity = gsap.quickTo(formContainer, '--glass-edge-opacity', { duration: 0.4, ease: 'power2.out' });

    const handlePointerMove = (e) => {
        const rect = formContainer.getBoundingClientRect();
        const pointerX = e.clientX - rect.left;
        const pointerY = e.clientY - rect.top;

        const relX = (pointerX / rect.width) - 0.5;
        const relY = (pointerY / rect.height) - 0.5;
        const distanceFromCenter = Math.min(Math.hypot(relX, relY) / 0.72, 1);

        setTiltX(`${relX * 5.5}deg`);
        setTiltY(`${-relY * 5.5}deg`);
        setMx(`${(pointerX / rect.width) * 100}%`);
        setMy(`${(pointerY / rect.height) * 100}%`);
        setEdgeOpacity((0.48 + (distanceFromCenter * 0.3)).toFixed(3));
    };

    const handlePointerLeave = () => {
        setTiltX(neutralGlassState.tiltX);
        setTiltY(neutralGlassState.tiltY);
        setMx(neutralGlassState.mx);
        setMy(neutralGlassState.my);
        setEdgeOpacity(neutralGlassState.edgeOpacity);
    };

    formContainer.addEventListener('pointermove', handlePointerMove);
    formContainer.addEventListener('pointerleave', handlePointerLeave);
    formContainer.addEventListener('pointercancel', handlePointerLeave);
    formContainer.addEventListener('pointerup', handlePointerLeave);
    
    // Simple Form Submission Feedback
    const form = container.querySelector('#contact-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = form.querySelector('.submit-btn span');
            if (btn) btn.textContent = 'ОТПРАВЛЕНО';
            gsap.to(form, { opacity: 0.5, pointerEvents: 'none', duration: 0.4 });
            form.reset();
        });
    }
};
