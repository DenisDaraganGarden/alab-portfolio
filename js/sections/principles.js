/**
 * Principles Section: Interactive Jumping Box [RIGHT-TO-LEFT]
 */

export const initPrinciples = (container) => {
    if (!container || typeof gsap === 'undefined') return;

    const boxWrapper = container.querySelector('.the-box-wrapper');
    const box = container.querySelector('#genie-box');
    const labels = container.querySelectorAll('.box-label');
    const items = container.querySelectorAll('.principle-item');

    if (!box || !items.length) return;

    // Configuration
    const steps = [
        { label: '1/3', x: -400, principleIndex: 0 }, // Left (Диагностика)
        { label: '2/3', x: 0,    principleIndex: 1 }, // Center (Проектирование)
        { label: '3/3', x: 400,  principleIndex: 2 }  // Right (Реализация)
    ];
    const stepByPrinciple = new Map(steps.map(step => [step.principleIndex, step]));

    let currentStepIndex = 0;
    let revealedCount = 0;
    let isAnimating = false;

    const getHiddenState = (principleIndex) => ({
        autoAlpha: 0,
        x: stepByPrinciple.get(principleIndex)?.x ?? 0,
        xPercent: -50,
        y: 120,
        scaleY: 0.26,
        scaleX: 0.06,
        rotationX: -82,
        skewX: -6,
        filter: 'blur(12px)',
        transformOrigin: '50% 100%'
    });

    const getVisibleState = (principleIndex) => ({
        autoAlpha: 1,
        x: stepByPrinciple.get(principleIndex)?.x ?? 0,
        xPercent: -50,
        y: 0,
        scaleY: 1,
        scaleX: 1,
        rotationX: 0,
        skewX: 0,
        filter: 'blur(0px)',
        transformOrigin: '50% 100%'
    });

    const getStretchState = (principleIndex) => ({
        ...getVisibleState(principleIndex),
        y: -8,
        scaleY: 0.92,
        scaleX: 1.06
    });

    items.forEach((item, principleIndex) => {
        gsap.set(item, getHiddenState(principleIndex));
    });
    
    // Set initial box position to the LEFT (Step 1)
    gsap.set(boxWrapper, { x: steps[0].x });
    labels.forEach(l => l.textContent = steps[0].label);

    // Initial 3D Box Idle Animation (Rotation)
    const boxIdle = gsap.to(box, {
        rotationY: 360,
        rotationX: 10,
        duration: 10,
        repeat: -1,
        ease: "none"
    });

    const revealPrinciple = (principle, principleIndex, duration = 0.8) => {
        gsap.killTweensOf(principle);
        const tl = gsap.timeline();

        tl.set(principle, getHiddenState(principleIndex));
        tl.to(principle, {
            autoAlpha: 1,
            duration: 0.01
        });
        tl.to(principle, {
            ...getStretchState(principleIndex),
            duration: duration * 0.68,
            ease: "expo.out"
        });
        tl.to(principle, {
            ...getVisibleState(principleIndex),
            duration: duration * 0.32,
            ease: "power2.out"
        });

        return tl;
    };

    const collapsePrinciple = (principle, targetX, duration = 0.42) => {
        gsap.killTweensOf(principle);
        const tl = gsap.timeline();

        tl.to(principle, {
            y: 22,
            scaleY: 0.72,
            scaleX: 1.02,
            rotationX: -28,
            skewX: 0,
            duration: duration * 0.28,
            ease: "power1.in"
        });
        tl.to(principle, {
            autoAlpha: 0,
            x: targetX,
            xPercent: -50,
            y: 120,
            scaleY: 0.26,
            scaleX: 0.06,
            rotationX: -82,
            skewX: -6,
            filter: 'blur(12px)',
            transformOrigin: '50% 100%',
            duration: duration * 0.72,
            ease: "power2.inOut"
        });

        return tl;
    };

    const collapseAllPrinciples = () => {
        if (isAnimating) return;
        isAnimating = true;

        const resetStep = steps[0];
        labels.forEach(l => l.textContent = resetStep.label);

        const tl = gsap.timeline({
            onComplete: () => {
                items.forEach((item, principleIndex) => {
                    gsap.set(item, getHiddenState(principleIndex));
                });
                currentStepIndex = 0;
                revealedCount = 0;
                gsap.set(boxWrapper, { x: resetStep.x });
                isAnimating = false;
            }
        });

        tl.to(box, { scaleY: 0.7, scaleX: 1.3, duration: 0.2 });

        tl.to(boxWrapper, {
            x: resetStep.x,
            duration: 0.6,
            ease: "power2.inOut"
        }, "+=0.05");

        tl.to(box, {
            y: -120,
            scaleY: 1.1,
            scaleX: 0.9,
            duration: 0.3,
            ease: "power2.out"
        }, "<")
        .to(box, {
            y: 0,
            scaleY: 1,
            scaleX: 1,
            duration: 0.3,
            ease: "bounce.out"
        });

        items.forEach((item) => {
            tl.add(collapsePrinciple(item, resetStep.x, 0.42), "-=0.42");
        });
    };

    const jumpToStep = (index) => {
        if (isAnimating) return;
        isAnimating = true;

        const step = steps[index];
        const nextPrinciple = items[step.principleIndex];

        // Update labels immediately or mid-jump
        labels.forEach(l => l.textContent = step.label);

        const tl = gsap.timeline({
            onComplete: () => {
                isAnimating = false;
            }
        });

        // 1. Squash & Prepare
        tl.to(box, { scaleY: 0.7, scaleX: 1.3, duration: 0.2 });

        // 2. The Jump (Arc)
        tl.to(boxWrapper, {
            x: step.x,
            duration: 0.6,
            ease: "power2.inOut"
        }, "+=0.05");

        tl.to(box, {
            y: -120, // Jump height (refined)
            scaleY: 1.1,
            scaleX: 0.9,
            duration: 0.3,
            ease: "power2.out"
        }, "<")
        .to(box, {
            y: 0,
            scaleY: 1,
            scaleX: 1,
            duration: 0.3,
            ease: "bounce.out"
        });

        // 3. Reveal current principle
        tl.add(revealPrinciple(nextPrinciple, step.principleIndex, 0.85), "-=0.38");
    };

    box.addEventListener('click', () => {
        if (isAnimating) return;

        if (revealedCount === 0) {
            const firstPrincipleIndex = steps[0].principleIndex;
            const firstPrinciple = items[firstPrincipleIndex];
            revealPrinciple(firstPrinciple, firstPrincipleIndex, 0.95);
            revealedCount = 1;
            return;
        }

        if (revealedCount < steps.length) {
            currentStepIndex = revealedCount;
            jumpToStep(currentStepIndex);
            revealedCount += 1;
            return;
        }

        collapseAllPrinciples();
    });

    // Handle initial reveal when section is visible
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.create({
        trigger: container,
        start: 'top 60%',
        onEnter: () => {
            // Optional: bounce box to hint interactivity
            gsap.from(box, { y: -50, duration: 1, ease: "bounce.out" });
        }
    });
};
