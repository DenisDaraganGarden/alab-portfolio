/**
 * Principles Section: desktop horizontal scene + mobile vertical jump scene
 */

const MOBILE_BREAKPOINT = 900;

export const initPrinciples = (container) => {
    if (!container || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    // Direct assignment to window for maximum visibility to nested GSAP functions
    window.alabGenieBox = container.querySelector('#genie-box');
    window.alabBoxWrapper = container.querySelector('.the-box-wrapper');
    var main = container.querySelector('.principles-main');
    var labels = container.querySelectorAll('.box-label');
    var items = Array.from(container.querySelectorAll('.principle-item'));

    const box = window.alabGenieBox;
    const boxWrapper = window.alabBoxWrapper;

    if (!main || !box || !boxWrapper || !items.length) return;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const isMobileLayout = () => window.innerWidth <= MOBILE_BREAKPOINT;
    const isAnimatedCompactLayout = () => window.innerWidth <= 768;
    const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let jumpHeight = 120;
    let steps = [];
    let stepByPrinciple = new Map();
    let textXByPrinciple = new Map();
    let cleanupScene = null;

    const buildLayout = () => {
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1440;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 900;
        const mainRect = main?.getBoundingClientRect();
        const boxRect = boxWrapper?.getBoundingClientRect();

        const mainWidth = mainRect?.width || viewportWidth;
        const boxSize = boxRect?.width || 150;
        const maxTravel = Math.max(0, (mainWidth - boxSize) / 2 - 12);
        const idealTravel = viewportWidth <= 768 ? mainWidth * 0.28 : Math.max(400, mainWidth * 0.34);
        const travel = Math.max(0, Math.min(idealTravel, maxTravel || idealTravel));

        jumpHeight = clamp(
            viewportHeight * (viewportWidth <= 768 ? 0.11 : 0.14),
            viewportWidth <= 768 ? 72 : 92,
            viewportWidth <= 768 ? 102 : 128
        );

        steps = [
            { label: '1/3', x: -travel, principleIndex: 0 },
            { label: '2/3', x: 0, principleIndex: 1 },
            { label: '3/3', x: travel, principleIndex: 2 }
        ];

        stepByPrinciple = new Map(steps.map((step) => [step.principleIndex, step]));
        textXByPrinciple = new Map(
            steps.map((step) => {
                const item = items[step.principleIndex];
                const itemWidth = parseFloat(window.getComputedStyle(item).width) || 0;
                const maxTextOffset = Math.max(0, (mainWidth - itemWidth) / 2 - 8);
                const textX = viewportWidth <= 768
                    ? clamp(step.x, -maxTextOffset, maxTextOffset)
                    : step.x;

                return [step.principleIndex, textX];
            })
        );

        container.style.setProperty('--principles-travel', `${travel}px`);
        container.style.setProperty('--principles-jump-height', `${jumpHeight}px`);
    };

    const getHiddenState = (principleIndex) => ({
        autoAlpha: 0,
        x: stepByPrinciple.get(principleIndex)?.x ?? 0,
        xPercent: -50,
        y: Math.max(88, jumpHeight),
        scaleY: 0.26,
        scaleX: 0.06,
        rotationX: -82,
        skewX: -6,
        filter: 'blur(12px)',
        transformOrigin: '50% 100%'
    });

    const applyMobileStaticState = () => {
        buildLayout();
        delete main.dataset.mobileJump;
        labels.forEach((label) => {
            label.textContent = '3/3';
        });

        gsap.set(boxWrapper, { clearProps: 'xPercent,x,y' });
        gsap.set(box, { clearProps: 'x,y,scale,scaleX,scaleY,rotationX,rotationZ' });
        items.forEach((item) => {
            gsap.set(item, { clearProps: 'all' });
        });
    };

    const getMobileHiddenState = () => ({
        autoAlpha: 0,
        y: 28,
        scaleY: 0.72,
        scaleX: 0.94,
        filter: 'blur(10px)',
        transformOrigin: '50% 0%'
    });

    const createMobileScene = () => {
        buildLayout();
        main.dataset.mobileJump = 'true';

        const getTargetYs = () => {
            const boxSize = boxWrapper.getBoundingClientRect().height || 96;
            const overlap = clamp(boxSize * 0.18, 16, 22);
            
            // ScrollTrigger.refresh() ensures layouts are up to date
            // Using offsetTop for simplicity, assuming items are direct children or positioned relative to main
            return items.map(item => (item.offsetTop || 0) - boxSize + overlap);
        };

        // Ensure initial hidden state is applied correctly but remains ready for animation
        gsap.set(box, getMobileHiddenState());

        gsap.set(boxWrapper, {
            xPercent: -50,
            x: 0,
            y: 0
        });
        gsap.set(box, {
            y: 0,
            scale: 1,
            scaleX: 1,
            scaleY: 1
        });
        labels.forEach((label) => {
            label.textContent = steps[0]?.label ?? '1/3';
        });
        items.forEach((item) => {
            gsap.set(item, getMobileHiddenState());
        });

        let targetYs = getTargetYs();
        const mobileJump = Math.max(42, jumpHeight * 0.58);

        // Auto-scale and Tilt logic for mobile
        const updateBoxDynamics = (self) => {
            const progress = self.progress;
            const viewportHeight = window.innerHeight;
            const boxRect = boxWrapper.getBoundingClientRect();
            const boxCenterY = boxRect.top + boxRect.height / 2;
            const screenCenterY = viewportHeight / 2;
            
            // Distance from center (0 to 1)
            const distFromCenter = Math.abs(boxCenterY - screenCenterY) / (viewportHeight / 2);
            const normalizedDist = Math.min(1, distFromCenter);
            
            // Auto-scale: grow when near center
            const scale = 1 + (1 - normalizedDist) * 0.45;
            gsap.set(boxWrapper, { scale: scale });
            
            // Dynamic Tilt based on scroll velocity and position
            const tiltX = (normalizedDist * 15) * (boxCenterY < screenCenterY ? 1 : -1);
            const tiltZ = self.getVelocity() / 200;
            
            gsap.set(box, { 
                rotationX: tiltX,
                rotationZ: gsap.utils.clamp(-8, 8, tiltZ)
            });
        };

        const scrollTl = gsap.timeline({
            scrollTrigger: {
                trigger: container,
                start: 'top top',
                end: () => `+=${Math.max(window.innerHeight * 1.02, items.length * 260)}`,
                scrub: 0.9,
                pin: true,
                pinSpacing: true,
                invalidateOnRefresh: true,
                onRefreshInit: () => {
                    buildLayout();
                    main.dataset.mobileJump = 'true';
                    labels.forEach((label) => {
                        label.textContent = steps[0]?.label ?? '1/3';
                    });
                    gsap.set(boxWrapper, {
                        xPercent: -50,
                        x: 0,
                        y: 0
                    });
                    gsap.set(box, {
                        y: 0,
                        scale: 1,
                        scaleX: 1,
                        scaleY: 1
                    });
                    items.forEach((item) => {
                        gsap.set(item, getMobileHiddenState());
                    });
                },
                onRefresh: () => {
                    targetYs = getTargetYs();
                },
                onUpdate: (self) => {
                    updateBoxDynamics(self);
                }
            }
        });

        const addMobileStepToTimeline = (timeline, stepIndex, label) => {
            const step = steps[stepIndex];
            const principleItem = items[step.principleIndex];

            timeline.to(box, {
                scaleY: 0.76,
                scaleX: 1.22,
                duration: 0.12
            }, label);

            timeline.to(box, {
                y: -mobileJump,
                scaleY: 1.12,
                scaleX: 0.88,
                duration: 0.22,
                ease: 'back.out(1.4)'
            }, `${label}+=0.08`);

            timeline.to(boxWrapper, {
                y: () => targetYs[stepIndex] ?? 0,
                duration: 0.34,
                ease: 'power1.inOut'
            }, `${label}+=0.12`);

            timeline.to(box, {
                y: 0,
                scaleY: 1,
                scaleX: 1,
                duration: 0.2,
                ease: 'power2.in'
            }, `${label}+=0.3`);

            timeline.set(labels, { textContent: step.label }, `${label}+=0.14`);

            timeline.to(principleItem, {
                autoAlpha: 1,
                y: 0,
                scaleY: 1,
                scaleX: 1,
                filter: 'blur(0px)',
                duration: 0.28,
                ease: 'power2.out'
            }, `${label}+=0.18`);
        };

        scrollTl.addLabel('mobileStart', '+=0.16');
        addMobileStepToTimeline(scrollTl, 0, 'mobileStep1');
        scrollTl.to({}, { duration: 0.16 });
        addMobileStepToTimeline(scrollTl, 1, 'mobileStep2');
        scrollTl.to({}, { duration: 0.16 });
        addMobileStepToTimeline(scrollTl, 2, 'mobileStep3');
        scrollTl.to({}, { duration: 0.3 });

        return scrollTl;
    };

    const createDesktopScene = () => {
        buildLayout();

        const scrollTl = gsap.timeline({
            scrollTrigger: {
                trigger: container,
                start: 'top top',
                end: '+=1200',
                scrub: 1,
                pin: true,
                pinSpacing: true,
                invalidateOnRefresh: true,
                onRefreshInit: () => {
                    buildLayout();
                }
            }
        });

        items.forEach((item, principleIndex) => {
            scrollTl.set(item, {
                autoAlpha: 0,
                x: () => stepByPrinciple.get(principleIndex)?.x ?? 0,
                xPercent: -50,
                y: () => Math.max(88, jumpHeight),
                scaleY: 0.26,
                scaleX: 0.06,
                rotationX: -82,
                skewX: -6,
                filter: 'blur(12px)',
                transformOrigin: '50% 100%'
            }, 0);
        });
        scrollTl.set(boxWrapper, { x: () => steps[0]?.x ?? 0, y: 0 }, 0);
        scrollTl.set(box, { y: 0, scaleX: 1, scaleY: 1 }, 0);
        scrollTl.set(labels, { textContent: () => steps[0]?.label ?? '1/3' }, 0);

        const addStepToTimeline = (timeline, stepIndex, label) => {
            const step = steps[stepIndex];
            const principleItem = items[step.principleIndex];

            if (isAnimatedCompactLayout() && stepIndex > 0) {
                const previousItem = items[steps[stepIndex - 1].principleIndex];
                timeline.to(previousItem, {
                    autoAlpha: 0,
                    y: 22,
                    scaleY: 0.72,
                    scaleX: 1.02,
                    filter: 'blur(12px)',
                    duration: 0.3
                }, label);
            }

            timeline.to(box, { scaleY: 0.7, scaleX: 1.3, duration: 0.2 }, label);

            if (stepIndex > 0) {
                timeline.to(boxWrapper, {
                    x: () => steps[stepIndex].x,
                    duration: 0.6,
                    ease: 'power1.inOut'
                }, `${label}+=0.05`);
            }

            timeline.to(box, {
                y: () => -jumpHeight,
                scaleY: 1.1,
                scaleX: 0.9,
                duration: 0.3,
                ease: 'power1.out'
            }, `${label}+=0.2`);

            timeline.to(box, {
                y: 0,
                scaleY: 1,
                scaleX: 1,
                duration: 0.3,
                ease: 'power1.in'
            }, `${label}+=0.5`);

            timeline.set(labels, { textContent: step.label }, `${label}+=0.2`);
            timeline.to(principleItem, { autoAlpha: 1, duration: 0.01 }, `${label}+=0.2`);
            timeline.to(principleItem, {
                x: () => textXByPrinciple.get(step.principleIndex) ?? 0,
                xPercent: -50,
                y: () => window.innerWidth <= 768 ? -6 : -8,
                scaleY: 0.92,
                scaleX: 1.06,
                rotationX: 0,
                skewX: 0,
                filter: 'blur(0px)',
                duration: 0.4,
                ease: 'power1.out'
            }, `${label}+=0.21`);
            timeline.to(principleItem, {
                y: 0,
                scaleY: 1,
                scaleX: 1,
                duration: 0.3,
                ease: 'power1.inOut'
            }, `${label}+=0.61`);
        };

        scrollTl.addLabel('start', '+=0.2');
        addStepToTimeline(scrollTl, 0, 'step1');
        scrollTl.addLabel('wait1', '+=0.3');
        addStepToTimeline(scrollTl, 1, 'step2');
        scrollTl.addLabel('wait2', '+=0.3');
        addStepToTimeline(scrollTl, 2, 'step3');
        scrollTl.to({}, { duration: 0.6 });

        return scrollTl;
    };

    let mm = gsap.matchMedia();

    mm.add(`(max-width: ${MOBILE_BREAKPOINT}px)`, () => {
        if (prefersReducedMotion()) {
            applyMobileStaticState();
            return () => {};
        }

        const scrollTl = createMobileScene();
        return () => {
            delete main.dataset.mobileJump;
            scrollTl.kill();
            gsap.set(boxWrapper, { clearProps: 'xPercent,x,y' });
            gsap.set(box, { clearProps: 'scale,scaleX,scaleY,y' });
            items.forEach((item) => {
                gsap.set(item, { clearProps: 'transform,opacity,filter,visibility' });
            });
        };
    });

    mm.add(`(min-width: ${MOBILE_BREAKPOINT + 1}px)`, () => {
        const scrollTl = createDesktopScene();
        return () => scrollTl.kill();
    });

    gsap.to(box, {
        rotationY: 360,
        rotationX: 10,
        duration: 10,
        repeat: -1,
        ease: 'none'
    });
};
