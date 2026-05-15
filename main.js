import './css/base.css';
import './css/layout.css';
import './css/components/header.css';
import './css/sections/hero.css';
import './css/sections/manifesto.css';
import './css/sections/profile.css';
import './css/sections/mission.css';
import './css/sections/principles.css';
import './css/sections/emotional-engineering.css';
import './css/sections/portfolio.css';
import './css/sections/case-blocks.css';
import './css/sections/contacts.css';
import './css/mobile-perf.css';

import { initHero } from './js/sections/hero.js';
import { initManifesto } from './js/sections/manifesto.js';
import { initProfile } from './js/sections/profile.js';
import { initMission } from './js/sections/mission.js';
import { initPrinciples } from './js/sections/principles.js';
import { initEmotionalEngineering } from './js/sections/emotional-engineering.js';
import { initPortfolio } from './js/sections/portfolio.js';
import { initContacts } from './js/sections/contacts.js';
import { initViewportMetrics } from './js/utils/viewport.js';
import { initIridescentTrail } from './js/effects/iridescent-trail.js';
import { initAnalytics } from './js/utils/analytics.js';

/**
 * [A.LAB] Main Initialization Script
 * Centralized registry-based initialization for all website sections.
 */

const initHeaderAnchorNavigation = () => {
    const links = document.querySelectorAll('.blob-menu-link[href^="#"]');

    links.forEach((link) => {
        link.addEventListener('click', (event) => {
            const hash = link.getAttribute('href');
            const target = hash ? document.querySelector(hash) : null;
            if (!target) return;

            event.preventDefault();

            if (window.lenis?.scrollTo) {
                window.lenis.scrollTo(target, { duration: 1.1 });
            } else {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            window.history.pushState(null, '', hash);
        });
    });
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('[A.LAB] Инициализация модулей...');

    const isTouchScrollDevice = window.matchMedia?.('(pointer: coarse)').matches;

    if (typeof ScrollTrigger !== 'undefined') {
        ScrollTrigger.config({
            ignoreMobileResize: true
        });

        if (isTouchScrollDevice && typeof ScrollTrigger.normalizeScroll === 'function') {
            ScrollTrigger.normalizeScroll({
                allowNestedScroll: true,
                type: 'touch,wheel'
            });
        }
    }

    // 1. Основная логика и утилиты (Lenis и др. загружаются через CDN в index.html)
    initViewportMetrics();
    initIridescentTrail();
    initHeaderAnchorNavigation();
    initAnalytics();

    // 2. Реестр инициализации секций
    const sections = [
        { id: 'hero', init: initHero },
        { id: 'manifesto', init: initManifesto },
        { id: 'profile', init: initProfile },
        { id: 'mission', init: initMission },
        { id: 'principles', init: initPrinciples },
        { id: 'emotional-engineering', init: initEmotionalEngineering },
        { id: 'portfolio', init: initPortfolio },
        { id: 'contacts', init: initContacts }
    ];

    // 3. Цикл инициализации секций
    sections.forEach(section => {
        const element = document.querySelector(`[data-section="${section.id}"]`);
        if (element) {
            try {
                section.init(element);
                console.log(`[A.LAB] Секция инициализирована: ${section.id}`);
            } catch (error) {
                console.error(`[A.LAB] Ошибка инициализации секции ${section.id}:`, error);
            }
        } else {
            console.warn(`[A.LAB] Контейнер секции не найден: ${section.id}`);
        }
    });

    // 4. Global Animations/Triggers
    setTimeout(() => {
        if (typeof ScrollTrigger !== 'undefined') {
            ScrollTrigger.refresh();
        }
    }, 100);
});
