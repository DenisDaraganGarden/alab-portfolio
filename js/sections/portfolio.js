/**
 * [A.LAB] Portfolio Module
 * Handles interactions for the portfolio section, including the case study full-screen modal.
 */

import { fetchJson, loadSettings, refreshScrollScenes } from '../boot/preloader.js';
import {
    renderCaseBlocks,
    hydrateCompareBlocks,
    hydrateCaseMedia,
    teardownCaseMedia,
    parseVideoEmbed,
    escapeHtml,
    escapeAttr,
    normalizeLinkUrl
} from './case-blocks.js';

export async function initPortfolio(container) {


    // Плашки индустрий строятся из данных, а не берутся из разметки: раньше
    // три категории были захардкожены в index.html, и любая новая категория,
    // заведённая в редакторе, на сайт просто не попадала — публикация
    // проходила без единого предупреждения.
    const industriesRoot = container.querySelector('.portfolio-industries');

    // Порядок показа исторически сложившихся категорий. Остальные идут следом
    // в том порядке, в каком их отдаёт редактор.
    const CATEGORY_ORDER = ['development', 'production', 'services'];

    const orderedCategoryIds = () => {
        const ids = Object.keys(portfolioData.categories || {});
        const known = CATEGORY_ORDER.filter(id => ids.includes(id));
        const rest = ids.filter(id => !CATEGORY_ORDER.includes(id));
        return [...known, ...rest];
    };

    let portfolioData = null;

    let siteSettings = {};
    try {
        portfolioData = await fetchJson('/data/cases.json', 4000);
        window.__ALAB_BOOT?.mark('data:cases');
    } catch (e) {
        console.error('[A.LAB] Ошибка загрузки cases.json', e);
        // Сетка останется пустой — снимаем с прогресса всё, что от неё
        // зависело, иначе процент никогда не дойдёт до ста.
        window.__ALAB_BOOT?.retire('data:cases');
        for (let i = 0; i < 6; i += 1) window.__ALAB_BOOT?.retire(`media:${i}`);
        return;
    }

    try {
        siteSettings = (await loadSettings()) || {};
        // Apply card styles from settings
        if (siteSettings.cards) {
            const cs = siteSettings.cards;
            const root = document.documentElement;
            root.style.setProperty('--card-radius', (cs.borderRadius ?? 12) + 'px');
            root.style.setProperty('--card-shadow-size', (cs.shadowSize ?? 10) + 'px');
            root.style.setProperty('--card-shadow-opacity', (cs.shadowOpacity ?? 15) / 100);
            root.style.setProperty('--card-hover-scale', (cs.hoverScale ?? 103) / 100);
        }
    } catch(e) {

    }

    // Направления: на главной до трёх плашек на категорию (приоритет — метка «На главной» из редактора),
    // клик по заголовку или плашке «ещё N» проваливается в категорию с полным списком
    const MAX_ON_MAIN = 3;
    const industriesWrap = container.querySelector('.portfolio-industries');
    const subtitleEl = container.querySelector('.portfolio-subtitle');
    let activeCategory = null;

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'portfolio-back';
    backBtn.textContent = '← все индустрии';
    backBtn.hidden = true;
    industriesWrap?.prepend(backBtn);
    backBtn.addEventListener('click', () => setCategory(null));

    const publishedIn = (categoryId) => portfolioData.projects
        .filter(p => p.categoryId === categoryId && p.status !== 'draft');

    const mainSelection = (projects) => projects.filter(p => p.featured)
        .concat(projects.filter(p => !p.featured))
        .slice(0, MAX_ON_MAIN);

    const escText = (v = '') => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const mq = (query) => typeof matchMedia === 'function' && matchMedia(query).matches;
    const prefersReducedMotion = () => mq('(prefers-reduced-motion: reduce)');
    const canHover = () => mq('(hover: hover) and (pointer: fine)');

    // Наблюдатели превью-видео карточек живут, пока живут карточки. Сетка
    // пересоздаётся при каждой навигации (renderIndustries → grid.innerHTML=''),
    // поэтому перед пересборкой все наблюдатели отключаются (см. renderIndustries).
    const hoverVideoObservers = new Set();
    const teardownHoverVideos = () => {
        hoverVideoObservers.forEach((io) => io.disconnect());
        hoverVideoObservers.clear();
    };

    // Ленивое зацикленное превью-видео карточки (поле проекта hoverVideo).
    // Десктоп — по наведению/фокусу, тач — автоплей, когда карточка в кадре.
    // Уважает prefers-reduced-motion (тогда остаётся статичный логотип).
    // Провязку делаем в buildCard: сетка карточек пересоздаётся при каждой
    // навигации по категориям, одноразовая гидрация после init не удержится.
    const wireHoverVideo = (card) => {
        const video = card.querySelector('.project-hover-video');
        if (!video || prefersReducedMotion()) return;

        // Флаг намерения: play() резолвится асинхронно, и если курсор уже ушёл
        // (или карточка вышла из кадра), опоздавший 'playing'/then не должен
        // снова показать превью поверх уже поставленного на паузу видео.
        let wantPreview = false;
        const attach = () => {
            if (!video.getAttribute('src')) {
                video.setAttribute('src', video.dataset.src);
                video.load();
            }
        };
        const reveal = () => { if (wantPreview) card.classList.add('is-previewing'); };
        const start = () => {
            wantPreview = true;
            attach();
            const played = video.play();
            if (played && typeof played.then === 'function') {
                played.then(reveal).catch(() => {});
            } else {
                reveal();
            }
        };
        const stop = () => {
            wantPreview = false;
            card.classList.remove('is-previewing');
            video.pause();
        };
        video.addEventListener('playing', reveal);

        if (canHover()) {
            card.addEventListener('pointerenter', start);
            card.addEventListener('pointerleave', stop);
            card.addEventListener('focusin', start);
            card.addEventListener('focusout', stop);
        } else if (typeof IntersectionObserver === 'function') {
            const io = new IntersectionObserver((entries) => {
                entries.forEach((entry) => (entry.isIntersecting ? start() : stop()));
            }, { threshold: 0.6 });
            io.observe(card);
            hoverVideoObservers.add(io);
        }
    };

    const buildCard = (proj) => {
        const card = document.createElement('div');
        card.className = 'portfolio-project-card';
        card.setAttribute('data-case', proj.id);
        card.setAttribute('aria-label', proj.title);
        card.setAttribute('role', 'link');
        card.setAttribute('tabindex', '0');
        const tagline = String(proj.tagline || '').trim();
        if (tagline) card.classList.add('has-tagline');
        // Превью карточки — только настоящий медиафайл (parseVideoEmbed отсекает
        // не-http(s), javascript:/data: и ссылки на плееры: зациклить iframe
        // как превью нельзя, нужен прямой mp4/webm).
        const hoverMedia = parseVideoEmbed(proj.hoverVideo);
        const hoverVideo = hoverMedia && hoverMedia.kind === 'file' ? hoverMedia.src : '';
        if (hoverVideo) card.classList.add('has-hover-video');
        const badge = proj.isExternal && proj.externalUrl
            ? '<span class="project-external-badge">Behance ↗</span>'
            : '';
        card.innerHTML = `
            ${hoverVideo ? `<video class="project-hover-video" muted loop playsinline preload="none" data-src="${escText(hoverVideo)}" aria-hidden="true"></video>` : ''}
            ${proj.logo ? `<div class="project-logo-wrapper"><img src="${escText(proj.logo)}" class="project-logo" alt="${escText(proj.title)} logo"></div>` : `<div class="project-logo-fallback">${escText(proj.title)}</div>`}
            ${tagline ? `<span class="project-tagline">${escText(tagline)}</span>` : ''}
            ${badge}
        `;

        const openProject = () => {
            if (proj.isExternal && proj.externalUrl) {
                window.open(proj.externalUrl, '_blank');
            } else {
                openModal(proj);
            }
        };
        card.addEventListener('click', openProject);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openProject();
            }
        });
        if (hoverVideo) wireHoverVideo(card);
        return card;
    };

    const buildMoreCard = (categoryId, hiddenCount, catTitle) => {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'portfolio-project-card project-more-card';
        more.setAttribute('aria-label', `Показать все проекты — ${catTitle}`);
        more.innerHTML = `<span class="project-more-count">+${hiddenCount}</span><span class="project-more-label">смотреть ещё</span>`;
        more.addEventListener('click', () => setCategory(categoryId));
        return more;
    };

    // Создаёт плашку категории со всей обвязкой. Заголовок кликабелен —
    // это вход в категорию.
    function buildIndustryBlock(categoryId) {
        const block = document.createElement('div');
        block.className = 'portfolio-industry';
        block.setAttribute('data-category', categoryId);

        const titleEl = document.createElement('h3');
        titleEl.className = 'industry-title industry-title--link';
        titleEl.setAttribute('role', 'button');
        titleEl.setAttribute('tabindex', '0');

        const toggleCategory = () => setCategory(activeCategory === categoryId ? null : categoryId);
        titleEl.addEventListener('click', toggleCategory);
        titleEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleCategory();
            }
        });

        const grid = document.createElement('div');
        grid.className = 'industry-projects';

        block.appendChild(titleEl);
        block.appendChild(grid);
        return block;
    }

    function renderIndustries() {
        if (!industriesRoot) return;

        // Все карточки ниже будут пересозданы (grid.innerHTML=''), поэтому
        // сначала отключаем наблюдатели превью-видео старых карточек.
        teardownHoverVideos();

        const ids = orderedCategoryIds();

        // Убираем плашки категорий, которых больше нет в данных
        Array.from(industriesRoot.querySelectorAll('.portfolio-industry')).forEach(block => {
            if (!ids.includes(block.getAttribute('data-category'))) block.remove();
        });

        ids.forEach(categoryId => {
            let block = industriesRoot.querySelector(`.portfolio-industry[data-category="${CSS.escape(categoryId)}"]`);
            if (!block) {
                block = buildIndustryBlock(categoryId);
                industriesRoot.appendChild(block);
            } else {
                // Порядок мог измениться — переставляем в конец по очереди
                industriesRoot.appendChild(block);
            }

            const titleEl = block.querySelector('.industry-title');
            const grid = block.querySelector('.industry-projects');
            if (!grid) return;

            const catTitle = portfolioData.categories[categoryId] || '';
            const projects = publishedIn(categoryId);
            const isActive = activeCategory === categoryId;

            if (titleEl && catTitle) {
                titleEl.textContent = catTitle + ' ';
                const countEl = document.createElement('span');
                countEl.className = 'industry-count';
                countEl.textContent = String(projects.length);
                titleEl.appendChild(countEl);
            }

            if (!projects.length || (activeCategory && !isActive)) {
                block.style.display = 'none';
                return;
            }

            block.style.display = '';
            block.classList.toggle('portfolio-industry--active', isActive);

            grid.innerHTML = '';
            const shown = isActive ? projects : mainSelection(projects);
            shown.forEach(proj => grid.appendChild(buildCard(proj)));
            if (!isActive && projects.length > shown.length) {
                grid.appendChild(buildMoreCard(categoryId, projects.length - shown.length, catTitle));
            }
        });

        backBtn.hidden = !activeCategory;
        if (subtitleEl) {
            subtitleEl.textContent = activeCategory
                ? (portfolioData.categories[activeCategory] || 'индустрии')
                : 'индустрии';
        }
    }

    function setCategory(categoryId) {
        activeCategory = categoryId;
        renderIndustries();
        // Провал в категорию перерисовывает сетку и меняет высоту документа.
        // Без пересчёта позиции секции контактов протухают сразу после
        // первого клика, а её карточка появляется за экраном или не
        // появляется вовсе — с pointer-events:none, то есть форма
        // становится физически нерабочей.
        refreshScrollScenes();
    }

    // Обработчики вешаются при создании плашки в buildIndustryBlock
    renderIndustries();

    // Modal logic
    const modal = document.getElementById('case-study-modal');
    const modalScrollArea = modal?.querySelector('.modal-scroll-area');
    const modalContent = document.getElementById('modal-content');
    const CLOSE_THRESHOLD = 6;
    const TRANSITION_DURATION = 600;

    let isOpen = false;
    let isClosing = false;
    let pageScrollBeforeOpen = 0;
    let lastKnownScrollTop = 0;
    let touchStartY = null;
    let activeCardOverlay = null;
    let modalAnimationObserver = null;
    // Отложенная очистка содержимого после анимации закрытия — id хранится,
    // чтобы отменить её при быстром открытии следующего кейса
    let closeTimer = 0;

    if (!modal || !modalScrollArea || !modalContent) return;

    // Рендер блоков кейса вынесен в ./case-blocks.js — тот же модуль
    // подключает предпросмотр редактора, чтобы вёрстка совпадала.

    const closeFocusedCard = (immediate = false) => {
        if (!activeCardOverlay) return;

        const overlay = activeCardOverlay;
        activeCardOverlay = null;
        document.body.classList.remove('has-case-card-lightbox');

        const removeOverlay = () => overlay.remove();
        if (immediate) {
            removeOverlay();
            return;
        }

        overlay.classList.remove('is-open');
        window.setTimeout(removeOverlay, 320);
    };

    const openFocusedCard = (card) => {
        if (!card) return;
        closeFocusedCard(true);

        const overlay = document.createElement('div');
        overlay.className = 'case-card-lightbox';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Просмотр карточки проекта');

        const shell = document.createElement('div');
        shell.className = 'case-card-lightbox-card';

        const clone = card.cloneNode(true);
        clone.classList.add('case-col--lightbox-clone');
        clone.classList.remove('case-col--expandable');
        clone.removeAttribute('role');
        clone.removeAttribute('tabindex');
        clone.removeAttribute('style');
        clone.querySelector('.case-col-media')?.removeAttribute('aria-hidden');
        clone.querySelector('.case-col-affordance')?.remove();

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'case-card-lightbox-close';
        closeButton.textContent = 'закрыть';

        const hint = document.createElement('div');
        hint.className = 'case-card-lightbox-hint';
        hint.textContent = 'кликните, чтобы закрыть';

        shell.appendChild(clone);
        overlay.append(shell, closeButton, hint);
        document.body.appendChild(overlay);
        document.body.classList.add('has-case-card-lightbox');
        activeCardOverlay = overlay;

        overlay.addEventListener('click', event => {
            if (event.target.closest('a')) return;
            closeFocusedCard();
        });

        requestAnimationFrame(() => overlay.classList.add('is-open'));
        closeButton.focus({ preventScroll: true });
    };

    const initColumnCards = () => {
        modalContent.querySelectorAll('.case-col--expandable').forEach(card => {
            card.addEventListener('click', event => {
                if (event.target.closest('a')) return;
                openFocusedCard(card);
            });
            card.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openFocusedCard(card);
            });
        });
    };

    const initCaseBlockAnimations = () => {
        if (modalAnimationObserver) {
            modalAnimationObserver.disconnect();
            modalAnimationObserver = null;
        }

        const revealables = modalContent.querySelectorAll('.case-block-reveal[data-animation]');
        if (!revealables.length) return;

        if (!('IntersectionObserver' in window)) {
            revealables.forEach(el => el.classList.add('is-visible'));
            return;
        }

        modalAnimationObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                modalAnimationObserver?.unobserve(entry.target);
            });
        }, { root: modalScrollArea, threshold: 0.18, rootMargin: '0px 0px -10% 0px' });

        revealables.forEach(el => modalAnimationObserver.observe(el));
    };

    const decorateModalLinks = () => {
        modalContent.querySelectorAll('a[href]').forEach(link => {
            const safeHref = normalizeLinkUrl(link.getAttribute('href'));
            if (!safeHref) {
                link.removeAttribute('href');
                return;
            }
            link.setAttribute('href', safeHref);
            if (!safeHref.startsWith('#')) {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
            }
        });
    };

    const restorePagePosition = () => {
        if (window.lenis) {
            window.lenis.start();
            window.lenis.scrollTo(pageScrollBeforeOpen, { immediate: true, force: true });
            return;
        }
        document.body.style.overflow = '';
        window.scrollTo(0, pageScrollBeforeOpen);
    };

    const closeModal = () => {
        if (!isOpen || isClosing) return;
        closeFocusedCard(true);
        modalAnimationObserver?.disconnect();
        modalAnimationObserver = null;
        teardownCaseMedia(modalContent);
        isClosing = true;
        isOpen = false;
        touchStartY = null;
        lastKnownScrollTop = 0;

        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');

        closeTimer = window.setTimeout(() => {
            closeTimer = 0;
            modalContent.innerHTML = '';
            modalScrollArea.scrollTop = 0;
            restorePagePosition();
            isClosing = false;
        }, TRANSITION_DURATION);
    };

    const tryCloseFromScrollIntent = (direction) => {
        if (!isOpen || isClosing) return;
        const { scrollTop, scrollHeight, clientHeight } = modalScrollArea;
        if (direction < 0 && scrollTop <= CLOSE_THRESHOLD) closeModal();
        else if (direction > 0 && scrollTop + clientHeight >= scrollHeight - CLOSE_THRESHOLD) closeModal();
    };

    const handleModalScroll = () => {
        if (!isOpen || isClosing) return;
        const currentScrollTop = modalScrollArea.scrollTop;
        const direction = currentScrollTop > lastKnownScrollTop ? 1 : currentScrollTop < lastKnownScrollTop ? -1 : 0;
        lastKnownScrollTop = currentScrollTop;

        if (!direction) return;

        const maxScrollTop = Math.max(0, modalScrollArea.scrollHeight - modalScrollArea.clientHeight);
        if (direction > 0 && currentScrollTop >= maxScrollTop - CLOSE_THRESHOLD) closeModal();
        if (direction < 0 && currentScrollTop <= CLOSE_THRESHOLD) closeModal();
    };

    const openModal = (proj) => {
        // Отменяем отложенную очистку от предыдущего закрытия: если закрыть
        // кейс и в течение анимации открыть другой, старый таймер вычистил бы
        // содержимое уже открытой модалки.
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0; }

        modalContent.innerHTML = '';

        // Разметка собирается общим модулем и вставляется ОДНИМ присваиванием.
        const html = renderCaseBlocks(proj.blocks);

        // Наличие контента определяем по факту собранной разметки, а не по
        // длине массива: кейс из одного незаполненного блока раньше давал
        // пустую простыню вместо заглушки.
        const hasBlocks = html.trim().length > 0;
        if (hasBlocks) modalContent.innerHTML = html;

        decorateModalLinks();
        initColumnCards();
        initCaseBlockAnimations();
        hydrateCompareBlocks(modalContent);
        hydrateCaseMedia(modalContent);

        if (!hasBlocks) {
            modalContent.innerHTML = `
                <div class="case-study-detail case-placeholder" style="padding: 10rem 5%; color: white;">
                    <h2 class="placeholder-title" style="font-size: 3rem;">${proj.title}</h2>
                    <p class="placeholder-text">Контент пока не добавлен</p>
                </div>`;
        }

        pageScrollBeforeOpen = window.scrollY || window.pageYOffset || 0;
        isOpen = true;
        isClosing = false;
        touchStartY = null;
        lastKnownScrollTop = 0;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        modalScrollArea.scrollTop = 0;

        if (window.lenis) window.lenis.stop();
        else document.body.style.overflow = 'hidden';
        
        requestAnimationFrame(() => modalScrollArea.scrollTop = 0);
    };

    modalScrollArea.addEventListener('scroll', handleModalScroll, { passive: true });
    modalScrollArea.addEventListener('wheel', e => tryCloseFromScrollIntent(Math.sign(e.deltaY)), { passive: true });
    modalScrollArea.addEventListener('touchstart', e => touchStartY = e.touches[0]?.clientY ?? null, { passive: true });
    modalScrollArea.addEventListener('touchmove', e => {
        const currentTouchY = e.touches[0]?.clientY;
        if (touchStartY == null || currentTouchY == null) return;
        tryCloseFromScrollIntent(Math.sign(touchStartY - currentTouchY));
    }, { passive: true });
    modalScrollArea.addEventListener('touchend', () => touchStartY = null, { passive: true });
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (activeCardOverlay) closeFocusedCard();
        else if (isOpen) closeModal();
    });
}
