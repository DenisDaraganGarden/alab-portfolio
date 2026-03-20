import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function initThemeSwitcher() {
    const updateTheme = (section) => {
        if (section.classList.contains('theme-dark')) {
            document.body.classList.add('theme-dark');
            document.body.classList.remove('theme-light');
        } else {
            document.body.classList.add('theme-light');
            document.body.classList.remove('theme-dark');
        }
    };

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
}
