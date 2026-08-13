import './css/preloader.css';
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
import { gate, runPreloader, refreshScrollScenes } from './js/boot/preloader.js';

export { refreshScrollScenes };

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

/**
 * Тяжёлые фоновые эффекты стартуют только после раскрытия: под шторкой
 * они жгли бы кадры ровно тогда, когда браузер парсит шрифты и меряет
 * вёрстку. Ни один из них не создаёт ScrollTrigger.
 */
const initDeferredEffects = () => {
    // Жидкостный след работает и на тач-устройствах. Прежний запрет стоял
    // из-за canvas-фильтра, который iOS Safari не поддерживал: эффект там
    // распадался на пиксельные пятна. Фильтра в эффекте больше нет, размытие
    // делает CSS одинаково во всех движках. На таче дымка появляется только
    // под пальцем, кадры ограничены по частоте, а все слушатели passive —
    // прокрутка остаётся нативной.
    try {
        initIridescentTrail();
    } catch (error) {
        console.error('[A.LAB] Ошибка инициализации iridescent-trail:', error);
    }
    // Водная гладь в финале (секция contacts): интерактивная лиловая рябь
    // + плавное растворение масляного следа при входе в секцию.
    try {
        initWaterRipple();
    } catch (error) {
        console.error('[A.LAB] Ошибка инициализации water-ripple:', error);
    }
    initAnalytics();
};

document.addEventListener('alab:reveal', initDeferredEffects, { once: true });

/**
 * Загрузка сайта. Модульный скрипт по определению deferred, обёртка
 * DOMContentLoaded ничего не давала и только вводила в заблуждение.
 */
async function boot() {
    console.log('[A.LAB] Инициализация модулей...');

    // Отменяем CSS-предохранитель: бандл выполнился, дальше за раскрытие
    // отвечает обычная логика.
    window.__ALAB_BOOT?.mark('bundle');
    document.getElementById('alab-preloader')?.classList.add('bundle-ok');

    if (typeof ScrollTrigger !== 'undefined') {
        ScrollTrigger.config({
            ignoreMobileResize: true
        });

        // Тач-скролл оставляем нативным: normalizeScroll перехватывает touch-события
        // и ведёт скролл через JS, что на iPhone даёт микро-подёргивания при скролле.
    }

    // 1. Утилиты, от которых зависят измерения. Без initViewportMetrics
    // переменная --app-height остаётся равной 1vh, и min-height каждой
    // секции считается от 100px.
    initViewportMetrics();
    initHeaderAnchorNavigation();

    // 2. ШРИФТОВОЙ ШЛЮЗ. Всё, что ниже, меряет вёрстку уже в Unbounded,
    // а не в фолбэке cursive: иначе посимвольный сплит, buildLayout
    // принципов и кеш прозрачности в emotional-engineering запекаются
    // по чужим метрикам, и поздний refresh их уже не лечит.
    await gate('шрифты', 4200);

    // 3. Реестр инициализации секций
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

    // 4. Инициализация. initPortfolio асинхронна — её промис раньше
    // терялся в forEach, а отказ после первого await становился
    // необработанным и молча убивал секцию.
    await Promise.allSettled(sections.map((section) => {
        const element = document.querySelector(`[data-section="${section.id}"]`);
        if (!element) {
            console.warn(`[A.LAB] Контейнер секции не найден: ${section.id}`);
            window.__ALAB_BOOT?.retire(`section:${section.id}`);
            return Promise.resolve();
        }
        return Promise.resolve()
            .then(() => section.init(element))
            .then(() => {
                console.log(`[A.LAB] Секция инициализирована: ${section.id}`);
            })
            .catch((error) => {
                console.error(`[A.LAB] Ошибка инициализации секции ${section.id}:`, error);
            })
            .finally(() => {
                window.__ALAB_BOOT?.mark(`section:${section.id}`);
            });
    }));

    // 5. Картинки, стабилизация вёрстки, пересчёт скролл-сцен и раскрытие.
    await runPreloader();
}

boot().catch((error) => {
    console.error('[A.LAB] Критическая ошибка загрузки:', error);
    // Видимый, но непрокручиваемый сайт недопустим ни при каком отказе.
    window.__ALAB_BOOT?.reveal('error');
});
