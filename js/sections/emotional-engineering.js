/**
 * Emotional Engineering Section
 *
 * Desktop keeps the pinned reveal scene.
 * Mobile switches to a natural document flow without pinned spacer gaps.
 */

const MOBILE_BREAKPOINT = 900;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getBaseOpacity = (element) => {
    const cached = Number(element.dataset.baseOpacity);
    if (!Number.isNaN(cached) && cached > 0) return cached;

    const computed = parseFloat(window.getComputedStyle(element).opacity || '1');
    const resolved = Number.isFinite(computed) ? computed : 1;
    element.dataset.baseOpacity = String(resolved);

    return resolved;
};

/**
 * Splits text into individual characters wrapped in spans, preserving <br> tags.
 */
const splitToChars = (element) => {
    if (!element) return [];
    
    const lines = element.innerHTML.split(/<br\s*\/?>/i);
    element.innerHTML = '';
    
    const allChars = [];
    
    lines.forEach((line, lineIndex) => {
        const lineSpan = document.createElement('span');
        lineSpan.style.display = 'block';
        lineSpan.style.whiteSpace = 'nowrap';
        
        // Use a temporary div to parse HTML entities if any, 
        // but here we just want the characters.
        const chars = [...line];
        
        chars.forEach(char => {
            const charSpan = document.createElement('span');
            charSpan.textContent = char === ' ' ? '\u00A0' : char;
            charSpan.style.display = 'inline-block';
            charSpan.style.willChange = 'transform, opacity, filter';
            lineSpan.appendChild(charSpan);
            allChars.push(charSpan);
        });
        
        element.appendChild(lineSpan);
        if (lineIndex < lines.length - 1) {
            element.appendChild(document.createElement('br'));
        }
    });
    
    return allChars;
};

export const initEmotionalEngineering = (container) => {
    if (!container || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    const title = container.querySelector('.ee-title');
    const subtitle = container.querySelector('.ee-subtitle');
    
    const titleChars = splitToChars(title);
    const subtitleChars = splitToChars(subtitle);
    
    const titleWrapper = container.querySelector('.ee-title-wrapper');
    const columns = [...container.querySelectorAll('.ee-column')];
    const arrows = [...container.querySelectorAll('.ee-arrow')];

    // Animation targets that are NOT individual characters
    const otherRevealElements = [
        ...columns,
        ...arrows
    ].filter(Boolean);

    const allRevealElements = [
        titleWrapper,
        ...otherRevealElements
    ];

    if (!allRevealElements.length) return;

    allRevealElements.forEach((element) => {
        getBaseOpacity(element);
    });

    const clearRevealState = () => {
        gsap.set([titleWrapper, ...otherRevealElements, ...titleChars, ...subtitleChars], {
            clearProps: 'all'
        });
    };

    let mm = gsap.matchMedia();

    mm.add(`(max-width: ${MOBILE_BREAKPOINT}px)`, () => {
        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: container,
                start: 'top 78%',
                once: true
            }
        });

        // Animate chars
        tl.fromTo(
            [...titleChars, ...subtitleChars],
            {
                opacity: 0,
                filter: 'blur(12px)',
                y: 20,
                x: () => (Math.random() - 0.5) * 30,
                scale: 0.8,
                rotation: () => (Math.random() - 0.5) * 45
            },
            {
                opacity: 1,
                filter: 'blur(0px)',
                y: 0,
                x: 0,
                scale: 1,
                rotation: 0,
                duration: 1.2,
                stagger: {
                    each: 0.02,
                    from: 'random'
                },
                ease: 'power3.out'
            }
        );

        // Animate columns and arrows
        tl.fromTo(
            otherRevealElements,
            {
                y: 28,
                scale: 0.985,
                filter: 'blur(10px)',
                opacity: (index, element) => clamp(getBaseOpacity(element) * 0.2, 0.14, 0.35)
            },
            {
                y: 0,
                scale: 1,
                filter: 'blur(0px)',
                opacity: (index, element) => getBaseOpacity(element),
                duration: 0.95,
                ease: 'power2.out',
                stagger: 0.08
            },
            '-=0.8'
        );

        return () => clearRevealState();
    });

    mm.add(`(min-width: ${MOBILE_BREAKPOINT + 1}px)`, () => {
        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: container,
                start: 'top top',
                end: '+=1500',
                scrub: 1,
                pin: true,
                pinSpacing: true,
                invalidateOnRefresh: true
            }
        });

        // Set perspective on wrapper for 3D feel
        gsap.set(titleWrapper, { perspective: 1000 });

        // Sands of Time - Title Coalesce
        tl.fromTo(
            [...titleChars, ...subtitleChars],
            {
                opacity: 0,
                filter: 'blur(20px) brightness(1.5)',
                scale: 0.5,
                x: () => (Math.random() - 0.5) * 100,
                y: () => (Math.random() - 0.5) * 100,
                z: () => Math.random() * 500,
                rotationX: () => (Math.random() - 0.5) * 180,
                rotationY: () => (Math.random() - 0.5) * 180,
                rotationZ: () => (Math.random() - 0.5) * 90
            },
            {
                opacity: 1,
                filter: 'blur(0px) brightness(1)',
                scale: 1,
                x: 0,
                y: 0,
                z: 0,
                rotationX: 0,
                rotationY: 0,
                rotationZ: 0,
                stagger: {
                    each: 0.015,
                    from: 'random'
                },
                ease: 'power2.inOut'
            }
        );

        // Columns reveal
        tl.fromTo(
            otherRevealElements,
            {
                y: 40,
                opacity: 0,
                filter: 'blur(10px)',
                scale: 0.98
            },
            {
                y: 0,
                opacity: (index, element) => getBaseOpacity(element),
                filter: 'blur(0px)',
                scale: 1,
                stagger: 0.1,
                ease: 'power2.out'
            },
            '-=0.4'
        );

        return () => clearRevealState();
    });
};
