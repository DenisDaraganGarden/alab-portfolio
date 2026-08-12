/**
 * [A.LAB] Portfolio Module
 * Handles interactions for the portfolio section, including the case study full-screen modal.
 */

import { fetchJson, loadSettings, refreshScrollScenes } from '../boot/preloader.js';

export async function initPortfolio(container) {


    const industryBlocks = container.querySelectorAll('.portfolio-industry');

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

    const buildCard = (proj) => {
        const card = document.createElement('div');
        card.className = 'portfolio-project-card';
        card.setAttribute('data-case', proj.id);
        card.setAttribute('aria-label', proj.title);
        card.setAttribute('role', 'link');
        card.setAttribute('tabindex', '0');
        const tagline = String(proj.tagline || '').trim();
        if (tagline) card.classList.add('has-tagline');
        const badge = proj.isExternal && proj.externalUrl
            ? '<span class="project-external-badge">Behance ↗</span>'
            : '';
        card.innerHTML = `
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

    function renderIndustries() {
        industryBlocks.forEach(block => {
            const categoryId = block.getAttribute('data-category');
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

    industryBlocks.forEach(block => {
        const categoryId = block.getAttribute('data-category');
        const titleEl = block.querySelector('.industry-title');
        if (!titleEl) return;
        titleEl.classList.add('industry-title--link');
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
    });

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

    if (!modal || !modalScrollArea || !modalContent) return;

    const LINK_PLATFORMS = {
        website: { label: 'Сайт', mark: '↗' },
        behance: { label: 'Behance', mark: 'Be' },
        telegram: { label: 'Telegram', mark: 'Tg' },
        whatsapp: { label: 'WhatsApp', mark: 'Wa' },
        instagram: { label: 'Instagram', mark: 'Ig' },
        youtube: { label: 'YouTube', mark: 'Yt' },
        pdf: { label: 'PDF', mark: 'PDF' },
        drive: { label: 'Drive', mark: 'Dr' },
        other: { label: 'Ссылка', mark: '•' },
    };

    const escapeHtml = (value = '') => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const escapeAttr = (value = '') => escapeHtml(value).replace(/`/g, '&#96;');

    const normalizeLinkUrl = (value, platform = '') => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/^(javascript|data|vbscript):/i.test(raw)) return '';
        if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
        if (platform === 'telegram' && /^@?[\w\d_]{3,}$/i.test(raw)) {
            return `https://t.me/${raw.replace(/^@/, '')}`;
        }
        if (platform === 'whatsapp' && /^[+\d\s().-]{7,}$/i.test(raw)) {
            const phone = raw.replace(/\D/g, '');
            return phone ? `https://wa.me/${phone}` : '';
        }
        if (/^(www\.|[\w-]+(\.[\w-]+)+)([/?#].*)?$/i.test(raw)) return `https://${raw}`;
        if (/^(\/(?!\/)|#)/.test(raw)) return raw;
        return '';
    };

    const displayLinkUrl = (value) => String(value || '')
        .replace(/^https?:\/\//i, '')
        .replace(/^mailto:/i, '')
        .replace(/^tel:/i, '')
        .replace(/^www\./i, '')
        .replace(/\/$/, '');

    const blockAnimation = (block) => block?.style?.animation || 'none';

    const stripHtmlForAnimation = (value = '') => String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();

    const renderAnimatedText = (value, animation) => {
        if (animation === 'split-lines') {
            const lines = stripHtmlForAnimation(value).split(/\n+/).map(line => line.trim()).filter(Boolean);
            return lines.map((line, index) => `<span class="case-anim-line" style="--item-i:${index}">${escapeHtml(line)}</span>`).join('');
        }
        if (animation === 'split-words') {
            const words = stripHtmlForAnimation(value).split(/\s+/).filter(Boolean);
            return words.map((word, index) => `<span class="case-anim-word" style="--item-i:${index}">${escapeHtml(word)}</span>`).join(' ');
        }
        return String(value || '').replace(/\n/g, '<br>');
    };

    const renderCaseBlock = (block, html) => {
        if (!html) return '';
        const animation = blockAnimation(block);
        if (animation === 'none') return html;
        return `<div class="case-block-reveal" data-animation="${escapeAttr(animation)}">${html}</div>`;
    };

    const renderLinksBlock = (block) => {
        const items = (block.items || [])
            .map(item => ({ ...item, href: normalizeLinkUrl(item.url, item.platform) }))
            .filter(item => item.href);
        if (!items.length) return '';

        const layoutClass = block.layout === 'inline' ? ' case-block-links--inline' : '';
        const title = block.title ? `<h3 class="case-links-title">${escapeHtml(block.title)}</h3>` : '';
        const links = items.map(item => {
            const platform = LINK_PLATFORMS[item.platform] || LINK_PLATFORMS.other;
            const label = item.label || platform.label;
            return `
                <a class="case-link-card" href="${escapeAttr(item.href)}" target="_blank" rel="noopener noreferrer" data-platform="${escapeAttr(item.platform || 'other')}">
                    <span class="case-link-icon">${escapeHtml(platform.mark)}</span>
                    <span class="case-link-copy">
                        <span class="case-link-label">${escapeHtml(label)}</span>
                        <span class="case-link-url">${escapeHtml(displayLinkUrl(item.href))}</span>
                    </span>
                </a>
            `;
        }).join('');

        return `<section class="case-block-links${layoutClass}">${title}<div class="case-links-grid">${links}</div></section>`;
    };

    const renderColumnCopy = (text = '') => {
        const lines = String(text || '')
            .split(/\n+/)
            .map(line => line.trim())
            .filter(Boolean);

        if (!lines.length) return '';
        if (lines.length === 1 && lines[0].length > 64) {
            return `<div class="case-col-copy"><p>${escapeHtml(lines[0])}</p></div>`;
        }

        const [title, ...body] = lines;
        return `
            <div class="case-col-copy">
                <h3 class="case-col-title">${escapeHtml(title)}</h3>
                ${body.length ? `<p>${body.map(escapeHtml).join('<br>')}</p>` : ''}
            </div>
        `;
    };

    const renderColumnsBlock = (block) => {
        const cols = (block.cols || [])
            .filter(col => String(col?.image || '').trim() || String(col?.text || '').trim());

        if (!cols.length) return '';

        const columnCount = Math.min(Math.max(cols.length, 1), 3);
        const cards = cols.map((col, index) => {
            const image = String(col.image || '').trim();
            const label = String(col.text || '').split(/\n+/).find(Boolean) || 'Материал проекта';
            const interactiveAttrs = image
                ? ` tabindex="0" role="button" aria-label="Открыть карточку: ${escapeAttr(label)}"`
                : '';

            return `
                <article class="case-col${image ? ' case-col--expandable' : ''}" style="--card-i:${index}"${interactiveAttrs}>
                    ${image ? `
                        <div class="case-col-media" aria-hidden="true">
                            <img src="${escapeAttr(image)}" alt="${escapeAttr(label)}"/>
                        </div>
                    ` : ''}
                    ${renderColumnCopy(col.text)}
                    ${image ? '<span class="case-col-affordance" aria-hidden="true">развернуть</span>' : ''}
                </article>
            `;
        }).join('');

        return `<div class="case-block-columns" data-cols="${columnCount}">${cards}</div>`;
    };

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
        isClosing = true;
        isOpen = false;
        touchStartY = null;
        lastKnownScrollTop = 0;

        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');

        window.setTimeout(() => {
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
        modalContent.innerHTML = '';
        
        let hasBlocks = false;
        if (proj.blocks && proj.blocks.length) {
            proj.blocks.forEach(block => {
                if (block.enabled === false) return;
                hasBlocks = true;
                switch(block.type) {
                    case 'raw_html':
                        modalContent.innerHTML += block.content;
                        break;
                    case 'heading': {
                        const lvl = block.level || 'h2';
                        modalContent.innerHTML += renderCaseBlock(block, `<${lvl} class="case-block-heading">${renderAnimatedText(block.content, blockAnimation(block))}</${lvl}>`);
                        break;
                    }
                    case 'text':
                        modalContent.innerHTML += renderCaseBlock(block, `<p class="case-block-text">${renderAnimatedText(block.content, blockAnimation(block))}</p>`);
                        break;
                    case 'image':
                        if (block.content) {
                            const mask = block.mask ? `clip-path: url(#${block.mask});` : '';
                            modalContent.innerHTML += renderCaseBlock(block, `<div class="case-block-image"><img src="${escapeAttr(block.content)}" alt="" style="${mask}"/></div>`);
                        }
                        break;
                    case 'video':
                        if (block.content) modalContent.innerHTML += renderCaseBlock(block, `<div class="case-block-video"><video src="${escapeAttr(block.content)}" autoplay muted loop playsinline></video></div>`);
                        break;
                    case 'gallery': {
                        const imgs = (block.images||[]).map(src => `<img src="${escapeAttr(src)}" alt=""/>`).join('');
                        modalContent.innerHTML += renderCaseBlock(block, `<div class="case-block-gallery">${imgs}</div>`);
                        break;
                    }
                    case 'links':
                        modalContent.innerHTML += renderCaseBlock(block, renderLinksBlock(block));
                        break;
                    case 'spacer':
                        modalContent.innerHTML += `<div style="height:${block.height||80}px"></div>`;
                        break;
                    case 'masked_image':
                        if (block.content) {
                            const cp = block.clipPath || 'circle(50% at 50% 50%)';
                            modalContent.innerHTML += renderCaseBlock(block, `<div class="case-block-image"><img src="${escapeAttr(block.content)}" alt="" style="clip-path:${cp};"/></div>`);
                        }
                        break;
                    case 'columns': {
                        modalContent.innerHTML += renderCaseBlock(block, renderColumnsBlock(block));
                        break;
                    }
                    case 'compare': {
                        if (block.before && block.after) {
                            const uid = 'cmp-' + Math.random().toString(36).slice(2,8);
                            modalContent.innerHTML += renderCaseBlock(block, `<div class="case-block-compare" id="${uid}"><img src="${escapeAttr(block.after)}" class="cmp-after" alt=""/><div class="cmp-before"><img src="${escapeAttr(block.before)}" class="cmp-before-img" alt=""/></div><div class="cmp-line"></div><span class="cmp-label cmp-label--before">ДО</span><span class="cmp-label cmp-label--after">ПОСЛЕ</span></div>`);
                            requestAnimationFrame(() => {
                                const el = document.getElementById(uid);
                                if (!el) return;
                                const onMove = (x) => { const r = el.getBoundingClientRect(); const pct = Math.max(0,Math.min(100,((x-r.left)/r.width)*100)); el.querySelector('.cmp-before').style.clipPath = `polygon(0 0, ${pct}% 0, ${pct}% 100%, 0 100%)`; el.querySelector('.cmp-line').style.left=pct+'%'; };
                                el.addEventListener('mousemove', e => onMove(e.clientX));
                                el.addEventListener('touchmove', e => { e.preventDefault(); onMove(e.touches[0].clientX); }, {passive:false});
                            });
                        }
                        break;
                    }
                    case 'quote':
                        modalContent.innerHTML += renderCaseBlock(block, `<blockquote class="case-block-quote"><p class="case-quote-text">${escapeHtml(block.text||'')}</p><div class="case-quote-author">${block.photo?`<img class="case-quote-photo" src="${escapeAttr(block.photo)}" alt=""/>`:''}<div><strong>${escapeHtml(block.author||'')}</strong>${block.role?`<br><span class="case-quote-role">${escapeHtml(block.role)}</span>`:''}</div></div></blockquote>`);
                        break;
                    case 'metrics':
                        modalContent.innerHTML += renderCaseBlock(block, `<div class="case-block-metrics">${(block.items||[]).map(m => `<div class="case-metric"><div class="case-metric-value">${escapeHtml(m.value||'')}</div><div class="case-metric-label">${escapeHtml(m.label||'')}</div></div>`).join('')}</div>`);
                        break;
                }
            });
        }

        decorateModalLinks();
        initColumnCards();
        initCaseBlockAnimations();
        
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
