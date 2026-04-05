/**
 * Hero Section Module
 * Handles entry animations and powerful interactive physics for the main landing area.
 */

export const initHero = (container) => {
    if (!container) return;
    const title = container.querySelector('.hero-title');
    const subtitle = container.querySelector('.hero-subtitle');

    // Helper to safely split text for animation, preserving words to avoid weird wrapping
    const splitText = (element) => {
        if (!element) return [];
        const text = element.innerText;
        element.innerHTML = '';
        const words = text.split(' ');
        const chars = [];

        words.forEach((word, wordIndex) => {
            const wordSpan = document.createElement('span');
            wordSpan.style.display = 'inline-block';
            wordSpan.style.whiteSpace = 'nowrap';
            
            for (let i = 0; i < word.length; i++) {
                const charSpan = document.createElement('span');
                charSpan.innerText = word[i];
                charSpan.style.display = 'inline-block';
                charSpan.style.position = 'relative';
                charSpan.style.pointerEvents = 'none'; // so they don't block mouse events or hover triggers
                charSpan.style.willChange = 'transform, opacity';
                wordSpan.appendChild(charSpan);
                chars.push(charSpan);
            }
            
            element.appendChild(wordSpan);
            
            if (wordIndex < words.length - 1) {
                const space = document.createTextNode(' ');
                element.appendChild(space);
            }
        });
        
        return chars;
    };

    const titleChars = splitText(title);
    const subtitleChars = splitText(subtitle);
    const allChars = [...titleChars, ...subtitleChars];

    if (typeof gsap !== 'undefined') {
        gsap.from(allChars, {
            y: (i) => 20 + Math.random() * 40,
            x: (i) => (Math.random() - 0.5) * 40,
            rotationZ: (i) => (Math.random() - 0.5) * 45,
            opacity: 0,
            duration: 1.5,
            stagger: 0.015,
            ease: 'elastic.out(1, 0.5)',
            delay: 0.2
        });
    }

    // -----------------------------------------
    // Interactive Physics (Repulsion & Springs)
    // -----------------------------------------
    
    // Store physics state for each letter
    const charsData = allChars.map(char => ({
        el: char,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        rotation: 0
    }));

    let mouseX = -1000;
    let mouseY = -1000;
    let activePointer = false;

    const updatePointer = (x, y) => {
        mouseX = x;
        mouseY = y;
        activePointer = true;
    };

    const clearPointer = () => {
        mouseX = -1000;
        mouseY = -1000;
        activePointer = false;
    };

    const onMouseMove = (e) => updatePointer(e.clientX, e.clientY);
    const onTouchMove = (e) => {
        if (e.touches.length > 0) {
            updatePointer(e.touches[0].clientX, e.touches[0].clientY);
        }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('mouseleave', clearPointer);
    window.addEventListener('touchend', clearPointer);
    window.addEventListener('touchcancel', clearPointer);

    let animationFrame;

    const updatePhysics = () => {
        // Base config
        const isMobile = window.innerWidth <= 768;
        const repulsionRadius = isMobile ? 120 : 250;
        const maxForce = isMobile ? 3 : 5;
        const spring = 0.08;
        const friction = 0.85;

        // Bounding box of the container to optimize mouse detection
        const sectionRect = container.getBoundingClientRect();
        
        // If mouse is very far away, we can still run physics until letters rest, 
        // but we only calculate repulsion if they are close.
        const isCursorNearContainer = mouseX > sectionRect.left - repulsionRadius && 
                                      mouseX < sectionRect.right + repulsionRadius && 
                                      mouseY > sectionRect.top - repulsionRadius && 
                                      mouseY < sectionRect.bottom + repulsionRadius;

        let activelyMoving = false;

        charsData.forEach(cd => {
            const rect = cd.el.getBoundingClientRect();
            // center point of the letter relative to viewport
            const charCx = rect.left + rect.width / 2;
            const charCy = rect.top + rect.height / 2;

            if (activePointer && isCursorNearContainer) {
                const dx = mouseX - charCx;
                const dy = mouseY - charCy;
                const distSq = dx * dx + dy * dy;

                // Repulsion logic
                if (distSq < repulsionRadius * repulsionRadius) {
                    const dist = Math.sqrt(distSq);
                    const force = Math.pow((repulsionRadius - dist) / repulsionRadius, 1.5);
                    cd.vx -= (dx / dist) * force * maxForce;
                    cd.vy -= (dy / dist) * force * maxForce;
                    
                    // Add slight random rotation spin
                    cd.rotation += (Math.random() - 0.5) * force * maxForce * 5;
                }
            }

            // Spring return to origin (0,0 local space)
            cd.vx += (0 - cd.x) * spring;
            cd.vy += (0 - cd.y) * spring;
            cd.rotation += (0 - cd.rotation) * spring * 0.5;

            // Apply friction
            cd.vx *= friction;
            cd.vy *= friction;
            cd.rotation *= friction;

            // Update local coords
            cd.x += cd.vx;
            cd.y += cd.vy;

            // Check if letter hasn't rested yet
            if (Math.abs(cd.vx) > 0.01 || Math.abs(cd.vy) > 0.01 || Math.abs(cd.x) > 0.01 || Math.abs(cd.y) > 0.01) {
                activelyMoving = true;
                
                // Slight z-axis scale pop effect depending on speed
                const speed = Math.sqrt(cd.vx * cd.vx + cd.vy * cd.vy);
                const scale = 1 + Math.min(speed * 0.02, 0.4);
                
                cd.el.style.transform = `translate3d(${cd.x}px, ${cd.y}px, 0) rotate(${cd.rotation}deg) scale(${scale})`;
                cd.el.style.opacity = 1 - Math.min(speed * 0.015, 0.5); // very slight fade when flying
            } else if (cd.x !== 0 || cd.y !== 0) {
                // Pin perfectly at 0 to avoid micro-calc overhead
                cd.x = 0; cd.y = 0; cd.vx = 0; cd.vy = 0; cd.rotation = 0;
                cd.el.style.transform = `none`;
                cd.el.style.opacity = 1;
            }
        });

        // Always loop (it's relatively cheap, about 30 elements), 
        // to handle dynamic touch movements smoothly.
        animationFrame = requestAnimationFrame(updatePhysics);
    };

    // Start physics loop
    updatePhysics();

    // Clean up
    return () => {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('mouseleave', clearPointer);
        window.removeEventListener('touchend', clearPointer);
        window.removeEventListener('touchcancel', clearPointer);
    };
};
