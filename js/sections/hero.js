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

            // Sync windows if they are attached to this element
            if (cd.el === currentTargetForWindow && activeWindowToSync) {
                const elRect = cd.el.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const left = elRect.left - containerRect.left + (elRect.width / 2);
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

    // Start physics loop
    updatePhysics();

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

    let namingTimeouts = [];
    let namingIntervals = [];
    let currentNamingWindow = null;

    const startNamingSequence = (el) => {
        currentTargetForWindow = el;

        if (!currentNamingWindow) {
            currentNamingWindow = document.createElement('div');
            currentNamingWindow.className = 'naming-window';
            
            const textEl = document.createElement('div');
            textEl.className = 'naming-text';
            currentNamingWindow.appendChild(textEl);
            
            const cursor = document.createElement('span');
            cursor.className = 'naming-cursor';
            currentNamingWindow.appendChild(cursor);
            
            container.appendChild(currentNamingWindow);
        }
        
        activeWindowToSync = currentNamingWindow;
        
        // Initial positioning
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        currentNamingWindow.style.left = `${elRect.left - containerRect.left + (elRect.width / 2)}px`;
        currentNamingWindow.style.top = `${elRect.top - containerRect.top + (elRect.height / 2)}px`;

        // Small delay to allow CSS transitions to trigger
        setTimeout(() => {
            currentNamingWindow.classList.add('is-visible');
        }, 10);

        const textEl = currentNamingWindow.querySelector('.naming-text');
        textEl.innerText = '';
        
        namingTimeouts.forEach(t => clearTimeout(t));
        namingIntervals.forEach(t => clearInterval(t));
        namingTimeouts = [];
        namingIntervals = [];
        
        const sequence = [
            { text: "Анализ: инновационный продукт", type: "type", time: 500 },
            { text: "Анализ: инновационный продукт", type: "delete", time: 3000 },
            { text: "Смыслы: точность, нейрон, связь", type: "type", time: 3800 },
            { text: "Смыслы: точность, нейрон, связь", type: "delete", time: 6300 },
            { text: "Синтез морфем: Neu + Core", type: "type", time: 7000 },
            { text: "Синтез морфем: Neu + Core", type: "delete", time: 9500 },
            { text: "NEUCORE?", type: "type", time: 10200 },
            { text: "NEUCORE?", type: "delete", time: 11500 },
            { text: "Слишком линейно.", type: "type", time: 12000 },
            { text: "Слишком линейно.", type: "delete", time: 13500 },
            { text: "Поиск абстракции...", type: "type", time: 14000 },
            { text: "Поиск абстракции...", type: "delete", time: 15500 },
            { text: "A X O N I A", type: "type", time: 16000 },
            { text: "A X O N I A", type: "delete", time: 18000 },
            { text: "Идеально.", type: "type", time: 18500 },
            { text: "Идеально.", type: "delete", time: 20000 },
            { text: "A.LAB / Нейминг", type: "type", time: 20500 }
        ];

        sequence.forEach(step => {
            namingTimeouts.push(setTimeout(() => {
                if (step.type === 'type') {
                    let i = 0;
                    const interval = setInterval(() => {
                        textEl.innerText += step.text[i];
                        i++;
                        if (i >= step.text.length) {
                            clearInterval(interval);
                        }
                    }, 40);
                    namingIntervals.push(interval);
                } else if (step.type === 'delete') {
                    const interval = setInterval(() => {
                        if (textEl.innerText.length > 0) {
                            textEl.innerText = textEl.innerText.slice(0, -1);
                        } else {
                            clearInterval(interval);
                        }
                    }, 20);
                    namingIntervals.push(interval);
                }
            }, step.time));
        });
    };

    const stopNamingSequence = (el) => {
        namingTimeouts.forEach(t => clearTimeout(t));
        namingIntervals.forEach(t => clearInterval(t));
        namingTimeouts = [];
        namingIntervals = [];
        
        if (currentNamingWindow) {
            currentNamingWindow.classList.remove('is-visible');
            setTimeout(() => {
                if (currentNamingWindow && currentNamingWindow.parentNode) {
                    currentNamingWindow.remove();
                    currentNamingWindow = null;
                    if (activeWindowToSync === currentNamingWindow) {
                        activeWindowToSync = null;
                        currentTargetForWindow = null;
                    }
                }
            }, 300);
        }
    };

    let chatTimeouts = [];
    let currentChatWindow = null;

    const chatMessages = [
        { text: "а может давай усложним? 🤔✨", type: "left", style: "effect-complex", delay: 500 },
        { text: "нее, давай упростим! 🛑", type: "right", style: "effect-simple", delay: 1500 },
        { text: "а давай вот так? вооооооооооо! 🤯💫", type: "left", style: "effect-wow", delay: 2500 },
        { text: "не, так не читается вообще 🧐", type: "left", style: "effect-fonts", delay: 3800 },
        { text: "а может вот так? 💿✨", type: "left", style: "effect-chrome", delay: 4800 },
        { text: "все, рилизим! 🚀", type: "right", style: "effect-morph", delay: 5800 },
        { text: "постой, еще немножко! 😅", type: "left", style: "effect-release", delay: 6800 },
        { text: "все же первый вариант был самым классным! 📐", type: "left", style: "effect-blueprint", delay: 8000 },
        { text: "да! согласна! 💯", type: "right", style: "effect-blueprint", delay: 9500 },
        { text: "все согласны! в продакшн! 🎉🚀", type: "left", style: "effect-blueprint", delay: 10500 },
    ];

    const startChatSequence = (el) => {
        currentTargetForWindow = el;

        if (!currentChatWindow) {
            currentChatWindow = document.createElement('div');
            currentChatWindow.className = 'joke-chat-window';
            container.appendChild(currentChatWindow);
        }
        
        activeWindowToSync = currentChatWindow;
        
        // Initial positioning
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        currentChatWindow.style.left = `${elRect.left - containerRect.left + (elRect.width / 2)}px`;
        currentChatWindow.style.top = `${elRect.top - containerRect.top}px`;

        currentChatWindow.innerHTML = '';
        setTimeout(() => {
            currentChatWindow.classList.add('is-visible');
        }, 10);
        
        chatTimeouts.forEach(t => clearTimeout(t));
        chatTimeouts = [];
        
        const removeAllEffects = () => {
            ['effect-blueprint', 'effect-complex', 'effect-simple', 'effect-wow', 'effect-fonts', 'effect-chrome', 'effect-morph', 'effect-release'].forEach(cls => {
                el.classList.remove(cls);
            });
        };

        removeAllEffects();

        const showTyping = (align) => {
            const typing = document.createElement('div');
            typing.className = `typing-indicator ${align}`;
            typing.innerHTML = '<span></span><span></span><span></span>';
            currentChatWindow.appendChild(typing);
            // scroll to bottom
            setTimeout(() => {
                currentChatWindow.scrollTop = currentChatWindow.scrollHeight;
            }, 10);
            return typing;
        };

        el.classList.add('effect-blueprint');

        let typingIndicator = null;
        
        chatMessages.forEach((msg, idx) => {
            if (idx > 0) {
                const typingDelay = msg.delay - 600;
                chatTimeouts.push(setTimeout(() => {
                    typingIndicator = showTyping(msg.type);
                }, typingDelay));
            }

            chatTimeouts.push(setTimeout(() => {
                if (typingIndicator) {
                    typingIndicator.remove();
                }
                const bubble = document.createElement('div');
                bubble.className = `chat-bubble ${msg.type}`;
                bubble.innerText = msg.text;
                currentChatWindow.appendChild(bubble);
                // scroll to bottom
                setTimeout(() => {
                    currentChatWindow.scrollTop = currentChatWindow.scrollHeight;
                }, 10);

                removeAllEffects();
                if (msg.style) {
                    el.classList.add(msg.style);
                }
            }, msg.delay));
        });
    };

    const stopChatSequence = (el) => {
        chatTimeouts.forEach(t => clearTimeout(t));
        chatTimeouts = [];
        if (currentChatWindow) {
            currentChatWindow.classList.remove('is-visible');
            setTimeout(() => {
                if (currentChatWindow && currentChatWindow.parentNode) {
                    currentChatWindow.remove();
                    currentChatWindow = null;
                    if (activeWindowToSync === currentChatWindow) {
                        activeWindowToSync = null;
                        currentTargetForWindow = null;
                    }
                }
            }, 300);
        }
        ['effect-blueprint', 'effect-complex', 'effect-simple', 'effect-wow', 'effect-fonts', 'effect-chrome', 'effect-morph', 'effect-release'].forEach(cls => {
            el.classList.remove(cls);
        });
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
                triggerEl.classList.add('effect-vibrate');
                break;
            case '1': // l
                triggerEl.classList.add('effect-rotate-l');
                startNamingSequence(triggerEl);
                scrambleText(serviceEl);
                break;
            case '2': // a
                container.classList.add('effect-chat-active');
                document.body.classList.add('chat-global-active');
                startChatSequence(triggerEl);
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
        triggerEl.classList.remove('is-active', 'effect-vibrate', 'effect-glitch', 'effect-blueprint', 'effect-spotlight', 'effect-rotate-l');
        serviceEl.classList.remove('is-highlighted');

        letterTriggers.forEach(t => t.classList.remove('dimmed-sibling'));
        servicesItems.forEach(s => s.classList.remove('dimmed-sibling'));
        container.classList.remove('effect-spotlight-active', 'effect-chat-active');

        switch(index) {
            case '0':
                break;
            case '1':
                stopNamingSequence(triggerEl);
                // resetScrambleText(triggerEl); // no longer scrambled
                resetScrambleText(serviceEl);
                break;
            case '2':
                document.body.classList.remove('chat-global-active');
                stopChatSequence(triggerEl);
                break;
            case '3':
                document.body.classList.remove('spotlight-global-active');
                break;
        }
    };

    // Click handler for audio (toggle on/off)
    const audioPlaying = new Set();
    const handleClick = (index, triggerEl) => {
        audioEngine.unlock();
        if (audioPlaying.has(index)) {
            // Stop
            switch(index) {
                case '0': audioEngine.stopVibration(); break;
                case '1': audioEngine.stopGlitch(); break;
                case '3': audioEngine.stopSpotlight(); break;
            }
            audioPlaying.delete(index);
            triggerEl.classList.remove('audio-active');
        } else {
            // Play
            switch(index) {
                case '0': audioEngine.playVibration(); break;
                case '1': audioEngine.playGlitch(); break;
                case '2': audioEngine.playGlass(); break;
                case '3': audioEngine.playSpotlight(); break;
            }
            audioPlaying.add(index);
            triggerEl.classList.add('audio-active');
        }
    };

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
    
  // ─── CTA rotating phrases ───
  const ctaEl = document.getElementById('heroCta');
  if (ctaEl) {
    const phrases = [
      'готов создать бренд, который вызывает эмоции?',
      'начни с брифа.',
      'расскажи о проекте — мы загоримся.'
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

});

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
    };
};
