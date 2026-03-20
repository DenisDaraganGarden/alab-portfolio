import { initHero } from './js/sections/hero.js';
import { initManifesto } from './js/sections/manifesto.js';
import { initProfile } from './js/sections/profile.js';
import { initMission } from './js/sections/mission.js';
import { initPrinciples } from './js/sections/principles.js';
import { initExpertise } from './js/sections/expertise.js';
import { initVerdetechCase } from './js/sections/verdetech-case.js';
import { initPortfolio } from './js/sections/portfolio.js';
import { initContacts } from './js/sections/contacts.js';
import { getSectionLoader } from './js/section-registry.js';

/**
 * [A.LAB] Main Initialization Script
 * Centralized registry-based initialization for all website sections.
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('[A.LAB] Инициализация модулей...');

    // 1. Основная логика и утилиты (Lenis и др. загружаются через CDN в index.html)

    // 2. Реестр инициализации секций
    const sections = [
        { id: 'hero', init: initHero },
        { id: 'manifesto', init: initManifesto },
        { id: 'profile', init: initProfile },
        { id: 'mission', init: initMission },
        { id: 'principles', init: initPrinciples },
        { id: 'expertise', init: initExpertise },
        { id: 'verdetech-case', init: initVerdetechCase },
        { id: 'portfolio', init: initPortfolio },
        { id: 'contacts', init: initContacts }
    ];

    // 3. Цикл динамической инициализации
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
            const loader = getSectionLoader(section.id);
            if (loader) {
                console.log(`[A.LAB] Найден динамический загрузчик для: ${section.id}`);
                loader();
            } else {
                console.warn(`[A.LAB] Контейнер секции не найден: ${section.id}`);
            }
        }
    });

    // 4. Global Animations/Triggers
    setTimeout(() => {
        if (typeof ScrollTrigger !== 'undefined') {
            ScrollTrigger.refresh();
        }
    }, 100);
});
