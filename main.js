import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

// 1. Initialize Lenis Smooth Scroll
const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
});

function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// 2. Utility: Split Text (Simple implementation)
function splitText(element) {
    const text = element.innerText;
    element.innerHTML = text.split(' ').map(word => 
        `<span class="word-wrapper" style="overflow:hidden; display:inline-block;">
            <span class="word" style="display:inline-block;">${word}</span>
        </span>`
    ).join(' ');
}

// 3. Setup Animations
const initAnimations = () => {
    // Hero Animation
    const heroTitle = document.querySelector('.hero-title');
    splitText(heroTitle);
    
    gsap.from('#hero .word', {
        yPercent: 100,
        stagger: 0.1,
        duration: 1.5,
        ease: 'power4.out',
        delay: 0.2
    });

    // Theme Switching Logic
    const sections = document.querySelectorAll('.section');
    sections.forEach((section) => {
        ScrollTrigger.create({
            trigger: section,
            start: 'top 50%',
            end: 'bottom 50%',
            onEnter: () => updateTheme(section),
            onEnterBack: () => updateTheme(section)
        });
    });

    const updateTheme = (section) => {
        if (section.classList.contains('theme-dark')) {
            document.body.classList.add('theme-dark');
            document.body.classList.remove('theme-light');
        } else {
            document.body.classList.add('theme-light');
            document.body.classList.remove('theme-dark');
        }
    };

    // Section 2: Manifesto Reveal
    const manifestoText = document.querySelector('.manifesto-text');
    splitText(manifestoText);
    
    gsap.from('#manifesto .word', {
        scrollTrigger: {
            trigger: '#manifesto',
            start: 'top 70%',
            end: 'center 40%',
            scrub: 1,
        },
        opacity: 0,
        y: 20,
        stagger: 0.05,
        duration: 1
    });

    // Section 3: Profile Profile
    const profileTitle = document.querySelector('.profile-title');
    splitText(profileTitle);

    gsap.from('#profile .word', {
        scrollTrigger: {
            trigger: '#profile',
            start: 'top 80%',
        },
        yPercent: 100,
        stagger: 0.02,
        duration: 1,
        ease: 'power3.out'
    });

    gsap.from('.profile-image img', {
        scrollTrigger: {
            trigger: '#profile',
            start: 'top bottom',
            end: 'bottom top',
            scrub: true
        },
        scale: 1.2,
        yPercent: -10
    });

    gsap.from('.services-list li', {
        scrollTrigger: {
            trigger: '.services-list',
            start: 'top 90%',
        },
        opacity: 0,
        x: -20,
        stagger: 0.1,
        duration: 0.8,
        ease: 'power2.out'
    });
};

window.addEventListener('load', initAnimations);
