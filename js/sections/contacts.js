/**
 * Contacts Section Module
 * Implements a reactive concave mirror form with "liquid" borders.
 */

export const initContacts = (container) => {
    if (!container) return;
    
    // Original intro animations
    const items = container.querySelectorAll(
        '.contacts-kicker, .contacts-title, .contacts-note, .contacts-brand-mark, .reactive-form-container'
    );

    if (typeof gsap !== 'undefined') {
        gsap.from(items, {
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

    const canAnimate = typeof gsap !== 'undefined';
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
