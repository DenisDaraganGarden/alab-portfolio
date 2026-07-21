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
import { initWaterRipple } from './js/effects/water-ripple.js';
import { initAnalytics } from './js/utils/analytics.js';

/**
 * [A.LAB] Main Initialization Script
 * Centralized registry-based initialization for all website sections.
 */

const initHeaderAnchorNavigation = () => {
    const links = document.querySelectorAll('.blob-menu-link[href^="#"]');
    const blob = document.querySelector('.contact-blob');

    const collapseBlob = () => blob?.classList.add('blob-collapsed');
    const expandBlob = () => blob?.classList.remove('blob-collapsed');

    links.forEach((link) => {
        link.addEventListener('click', (event) => {
            const hash = link.getAttribute('href');
            const target = hash ? document.querySelector(hash) : null;
            if (!target) return;

            event.preventDefault();

            collapseBlob();

            if (window.lenis?.scrollTo) {
                window.lenis.scrollTo(target, { duration: 1.1 });
            } else {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            window.history.pushState(null, '', hash);
        });
    });

    if (blob) {
        // Десктоп: после ухода курсора сброс — следующий ховер снова раскрывает
        blob.addEventListener('mouseleave', expandBlob);
        // Тач: эмулированный hover залипает, поэтому тап по свёрнутому блобу раскрывает его обратно.
        // Клики по пунктам меню сюда всплывают — их пропускаем, иначе блоб раскроется сразу после сворачивания.
        blob.addEventListener('click', (event) => {
            if (event.target.closest('.blob-menu-link')) return;
            if (blob.classList.contains('blob-collapsed')) {
                event.preventDefault();
                expandBlob();
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('[A.LAB] Инициализация модулей...');

    const isTouchScrollDevice = window.matchMedia?.('(pointer: coarse)').matches;

    if (typeof ScrollTrigger !== 'undefined') {
        ScrollTrigger.config({
            ignoreMobileResize: true
        });

        // Тач-скролл оставляем нативным: normalizeScroll перехватывает touch-события
        // и ведёт скролл через JS, что на iPhone даёт микро-подёргивания при скролле.
    }

    // 1. Основная логика и утилиты (Lenis и др. загружаются через CDN в index.html)
    initViewportMetrics();
    // Жидкостный след — только для десктопа: iOS Safari не поддерживает canvas
    // ctx.filter blur (пиксельные розово-фиолетовые пятна), а покадровая симуляция
    // нагружает главный поток во время скролла.
    if (!isTouchScrollDevice && window.matchMedia?.('(min-width: 769px)').matches) {
        initIridescentTrail();
    }
    // Водная гладь в финале (секция contacts): интерактивная лиловая рябь
    // + плавное растворение масляного следа при входе в секцию.
    try {
        initWaterRipple();
    } catch (error) {
        console.error('[A.LAB] Ошибка инициализации water-ripple:', error);
    }
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
