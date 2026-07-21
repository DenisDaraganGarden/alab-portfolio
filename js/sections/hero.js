/**
 * Hero Section Module
 * Handles entry animations and powerful interactive physics for the main landing area.
 */

import { audioEngine } from '../utils/WebAudioEngine.js';

export const initHero = (container) => {
    if (!container) return;
    const fallingChars = container.querySelectorAll('.falling-char');
    const subtitle = container.querySelector('.hero-subtitle');
    const servicesItems = container.querySelectorAll('.hero-services-list li');
    const ctaBlock = container.querySelector('.hero-bottom-right');
    const letterTriggers = container.querySelectorAll('.letter-trigger');

    audioEngine.configure({ audio: { enabled: false } });

    fetch('/data/settings.json', { cache: 'no-store' })
        .then(response => response.ok ? response.json() : null)
        .then(settings => {
            audioEngine.configure(settings || { audio: { enabled: false } });
        })
        .catch(() => {
            audioEngine.configure({ audio: { enabled: false } });
        });

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

    let subtitleChars = [];
    if (subtitle) {
        subtitleChars = splitText(subtitle);
    }

    if (typeof gsap !== 'undefined') {
        // Animate falling characters
        if (fallingChars.length > 0) {
            gsap.from(fallingChars, {
                y: -150,
                opacity: 0,
                duration: 1.2,
                stagger: 0.15,
                ease: 'bounce.out',
                delay: 0.1,
                onComplete: () => {
                    gsap.set(fallingChars, { clearProps: "transform,opacity,willChange" });
                }
            });
        }

        // Animate subtitle chars
        if (subtitleChars.length > 0) {
            gsap.from(subtitleChars, {
                y: (i) => 20 + Math.random() * 40,
                x: (i) => (Math.random() - 0.5) * 40,
                rotationZ: (i) => (Math.random() - 0.5) * 45,
                opacity: 0,
                duration: 1.5,
                stagger: 0.015,
                ease: 'elastic.out(1, 0.5)',
                delay: 0.5
            });
        }

        // Fade in new elements
        gsap.from([servicesItems, ctaBlock], {
            y: 20,
            opacity: 0,
            duration: 1,
            stagger: 0.1,
            ease: 'power2.out',
            delay: 0.8
        });
    }

    // -----------------------------------------
    // Interactive Physics (Repulsion & Springs)
    // -----------------------------------------
    
    // Store physics state for each letter (Applied ONLY to subtitle)
    const charsData = subtitleChars.map(char => ({
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

    // На тач-устройствах физика отталкивания не запускается: палец при скролле
    // разбрасывает буквы подзаголовка (inline transform/opacity), а цикл rAF
    // с getBoundingClientRect на каждый кадр добавляет подёргивания на iPhone.
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

    if (!coarsePointer) {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('mouseleave', clearPointer);
        window.addEventListener('touchend', clearPointer);
        window.addEventListener('touchcancel', clearPointer);
    }

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

            // Sync windows if they are attached to this element
            if (cd.el === currentTargetForWindow && activeWindowToSync) {
                const elRect = cd.el.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const left = clampWindowLeft(activeWindowToSync, elRect.left - containerRect.left + (elRect.width / 2), containerRect);
                const top = elRect.top - containerRect.top + (elRect.height / 2);
                activeWindowToSync.style.left = `${left}px`;
                activeWindowToSync.style.top = `${top}px`;
            }
        });

        // Always loop (it's relatively cheap, about 30 elements), 
        // to handle dynamic touch movements smoothly.
        animationFrame = requestAnimationFrame(updatePhysics);
    };

    let currentTargetForWindow = null;
    let activeWindowToSync = null;

    // Не даём плашке (центрируется на букве через translate(-50%)) вылезать за экран на узких вьюпортах
    const clampWindowLeft = (win, desiredLeft, containerRect) => {
        const half = (win.offsetWidth || 0) / 2 + 8;
        const max = containerRect.width - half;
        if (max <= half) return desiredLeft; // окно шире контейнера — не трогаем
        return Math.min(Math.max(desiredLeft, half), max);
    };

    // Start physics loop
    if (!coarsePointer) {
        updatePhysics();
    }

    // -----------------------------------------
    // Tactile Typography Interactions
    // -----------------------------------------
    
    // Unlock Audio Context silently on first interaction
    const unlockAudio = () => {
        audioEngine.unlock();
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);

    // Scramble Text Utility for 'l'
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
    let scrambleIntervals = new Map();

    const scrambleText = (el) => {
        if (!el.dataset.originalText) el.dataset.originalText = el.innerText;
        const originalText = el.dataset.originalText;
        
        let iteration = 0;
        clearInterval(scrambleIntervals.get(el));

        const interval = setInterval(() => {
            el.innerText = originalText.split("")
                .map((letter, index) => {
                    if(index < iteration) {
                        return originalText[index];
                    }
                    return letters[Math.floor(Math.random() * letters.length)];
                })
                .join("");
            
            if(iteration >= originalText.length){
                clearInterval(interval);
            }
            iteration += 1 / 3;
        }, 30);
        scrambleIntervals.set(el, interval);
    };

    const resetScrambleText = (el) => {
        clearInterval(scrambleIntervals.get(el));
        if (el.dataset.originalText) {
            el.innerText = el.dataset.originalText;
        }
    };

    let currentNamingWindow = null;
    let namingRevealTimer = null;
    const namingMarqueeText = 'контекст -> аудитория -> смыслы -> звучание -> A.LAB / нейминг -> ';

    const startNamingSequence = (el) => {
        currentTargetForWindow = el;

        if (!currentNamingWindow) {
            currentNamingWindow = document.createElement('div');
            currentNamingWindow.className = 'naming-window';

            const track = document.createElement('div');
            track.className = 'naming-track';
            track.innerHTML = `<span>${namingMarqueeText}</span><span aria-hidden="true">${namingMarqueeText}</span>`;
            currentNamingWindow.appendChild(track);
            
            container.appendChild(currentNamingWindow);
        }
        
        activeWindowToSync = currentNamingWindow;
        
        // Initial positioning
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const initialLeft = clampWindowLeft(currentNamingWindow, elRect.left - containerRect.left + (elRect.width / 2), containerRect);
        currentNamingWindow.style.left = `${initialLeft}px`;
        currentNamingWindow.style.top = `${elRect.top - containerRect.top + (elRect.height / 2)}px`;

        clearTimeout(namingRevealTimer);
        namingRevealTimer = setTimeout(() => {
            currentNamingWindow?.classList.add('is-visible');
        }, 20);
    };

    const stopNamingSequence = () => {
        clearTimeout(namingRevealTimer);
        namingRevealTimer = null;
        
        if (currentNamingWindow) {
            const windowToRemove = currentNamingWindow;
            windowToRemove.classList.remove('is-visible');
            setTimeout(() => {
                if (windowToRemove.parentNode) {
                    windowToRemove.remove();
                    if (activeWindowToSync === windowToRemove) {
                        activeWindowToSync = null;
                        currentTargetForWindow = null;
                    }
                }
                if (currentNamingWindow === windowToRemove) currentNamingWindow = null;
            }, 300);
        }
    };

    const brandStyleClasses = [
        'effect-blueprint',
        'effect-complex',
        'effect-simple',
        'effect-wow',
        'effect-fonts',
        'effect-chrome',
        'effect-morph',
        'effect-release'
    ];
    const brandStyleSteps = [
        { cls: 'effect-blueprint', delay: 0 },
        { cls: 'effect-complex', delay: 500 },
        { cls: 'effect-simple', delay: 1500 },
        { cls: 'effect-wow', delay: 2500 },
        { cls: 'effect-fonts', delay: 3800 },
        { cls: 'effect-chrome', delay: 4800 },
        { cls: 'effect-morph', delay: 5800 },
        { cls: 'effect-release', delay: 6800 },
        { cls: 'effect-blueprint', delay: 8000 }
    ];
    let brandStyleTimers = [];
    let brandStyleLoopTimer = null;

    const clearBrandStyles = (el) => {
        brandStyleClasses.forEach(cls => el?.classList.remove(cls));
    };

    const applyBrandStyle = (el, cls) => {
        clearBrandStyles(el);
        el?.classList.add(cls);
    };

    const stopBrandStyleSequence = (el) => {
        brandStyleTimers.forEach(timer => clearTimeout(timer));
        brandStyleTimers = [];
        clearTimeout(brandStyleLoopTimer);
        brandStyleLoopTimer = null;
        clearBrandStyles(el);
    };

    const startBrandStyleSequence = (el) => {
        stopBrandStyleSequence(el);

        const run = () => {
            brandStyleTimers = [];
            brandStyleSteps.forEach(step => {
                brandStyleTimers.push(setTimeout(() => applyBrandStyle(el, step.cls), step.delay));
            });
            brandStyleLoopTimer = setTimeout(run, 9200);
        };

        run();
    };

    // Event Handlers
    const handleMouseEnter = (index, triggerEl, serviceEl) => {
        audioEngine.unlock(); // Ensure it's unlocked if possible
        
        // Add active classes
        triggerEl.classList.add('is-active');
        serviceEl.classList.add('is-highlighted');

        // Dim siblings
        letterTriggers.forEach(t => { if (t !== triggerEl) t.classList.add('dimmed-sibling'); });
        servicesItems.forEach(s => { if (s !== serviceEl) s.classList.add('dimmed-sibling'); });

        switch(index) {
            case '0': // a.
                triggerEl.classList.add('effect-communication');
                break;
            case '1': // l
                triggerEl.classList.add('effect-rotate-l');
                startNamingSequence(triggerEl);
                scrambleText(serviceEl);
                break;
            case '2': // a
                startBrandStyleSequence(triggerEl);
                break;
            case '3': // b
                // Spotlight applies globally to the section
                container.classList.add('effect-spotlight-active');
                document.body.classList.add('spotlight-global-active');
                triggerEl.classList.add('effect-spotlight');
                break;
        }
    };

    const handleMouseLeave = (index, triggerEl, serviceEl) => {
        triggerEl.classList.remove('is-active', 'effect-communication', 'effect-glitch', 'effect-spotlight', 'effect-rotate-l');
        serviceEl.classList.remove('is-highlighted');

        letterTriggers.forEach(t => t.classList.remove('dimmed-sibling'));
        servicesItems.forEach(s => s.classList.remove('dimmed-sibling'));
        container.classList.remove('effect-spotlight-active');

        switch(index) {
            case '0':
                break;
            case '1':
                stopNamingSequence(triggerEl);
                // resetScrambleText(triggerEl); // no longer scrambled
                resetScrambleText(serviceEl);
                break;
            case '2':
                stopBrandStyleSequence(triggerEl);
                break;
            case '3':
                document.body.classList.remove('spotlight-global-active');
                break;
        }
    };

    // Click handler for audio (toggle on/off)
    const audioPlaying = new Set();
    const audioActiveTimers = new Map();

    const stopActiveAudio = (index, triggerEl) => {
        audioEngine.stopLetter(index);
        audioPlaying.delete(index);
        window.clearTimeout(audioActiveTimers.get(index));
        audioActiveTimers.delete(index);
        triggerEl?.classList.remove('audio-active');
    };

    const stopAllAudio = () => {
        audioEngine.stopAll();
        audioPlaying.clear();
        audioActiveTimers.forEach(timer => window.clearTimeout(timer));
        audioActiveTimers.clear();
        letterTriggers.forEach(trigger => trigger.classList.remove('audio-active'));
    };

    const handleClick = (index, triggerEl) => {
        if (!audioEngine.enabled) return;

        audioEngine.unlock();
        if (audioPlaying.has(index)) {
            stopActiveAudio(index, triggerEl);
        } else {
            const result = audioEngine.playLetter(index);
            if (!result.playing) return;

            triggerEl.classList.add('audio-active');

            if (result.oneShot) {
                window.clearTimeout(audioActiveTimers.get(index));
                audioActiveTimers.set(index, window.setTimeout(() => {
                    triggerEl.classList.remove('audio-active');
                    audioActiveTimers.delete(index);
                }, 900));
            } else {
                audioPlaying.add(index);
            }
        }
    };

    const handleVisibilityStop = () => {
        if (document.hidden) stopAllAudio();
    };

    document.addEventListener('visibilitychange', handleVisibilityStop);
    window.addEventListener('pagehide', stopAllAudio);
    window.addEventListener('blur', stopAllAudio);

    // Attach to triggers
    letterTriggers.forEach(trigger => {
        const index = trigger.dataset.serviceIndex;
        const service = Array.from(servicesItems).find(s => s.dataset.serviceIndex === index);
        
        if (service) {
            const onEnter = () => handleMouseEnter(index, trigger, service);
            const onLeave = () => handleMouseLeave(index, trigger, service);
            const onClick = () => handleClick(index, trigger);
            
            trigger.addEventListener('mouseenter', onEnter);
            trigger.addEventListener('mouseleave', onLeave);
            trigger.addEventListener('click', onClick);
            
            // Bidirectional syncing
            service.addEventListener('mouseenter', onEnter);
            service.addEventListener('mouseleave', onLeave);
        }
    });

    // ─── CTA rotating phrases ───
    const ctaEl = document.getElementById('heroCta');
    if (ctaEl) {
        const phrases = [
            'готовы создать бренд, который вызывает эмоции?',
            'начни с брифа.'
        ];
        let pi = 0;
        setInterval(() => {
            ctaEl.classList.add('fade-out');
            setTimeout(() => {
                pi = (pi + 1) % phrases.length;
                ctaEl.textContent = phrases[pi];
                ctaEl.classList.remove('fade-out');
            }, 500);
        }, 3000);
    }

    // Clean up
    return () => {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('mouseleave', clearPointer);
        window.removeEventListener('touchend', clearPointer);
        window.removeEventListener('touchcancel', clearPointer);
        
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        document.removeEventListener('visibilitychange', handleVisibilityStop);
        window.removeEventListener('pagehide', stopAllAudio);
        window.removeEventListener('blur', stopAllAudio);
        letterTriggers.forEach(trigger => stopBrandStyleSequence(trigger));
        stopAllAudio();
    };
};
