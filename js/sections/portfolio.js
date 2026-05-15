/**
 * [A.LAB] Portfolio Module
 * Handles interactions for the portfolio section, including the case study full-screen modal.
 */

export async function initPortfolio(container) {


    const mainGrid = container.querySelector('#main-portfolio-grid');
    const submenuContainer = container.querySelector('#portfolio-submenu');
    const submenuGrid = container.querySelector('#portfolio-submenu-grid');
    const submenuTitle = container.querySelector('#portfolio-submenu-title');
    const backBtn = container.querySelector('#portfolio-back-btn');
    const categoryCards = container.querySelectorAll('.category-card');

    let portfolioData = null;
    
    let siteSettings = {};
    try {
        const response = await fetch('/data/cases.json');
        portfolioData = await response.json();
    } catch (e) {
        console.error('[A.LAB] Ошибка загрузки cases.json', e);
        return;
    }

    try {
        const sr = await fetch('/data/settings.json');
        siteSettings = await sr.json();
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

    if (categoryCards && mainGrid && submenuContainer && backBtn) {
        categoryCards.forEach(card => {
            card.addEventListener('click', () => {
                const categoryId = card.getAttribute('data-category');
                openCategory(categoryId);
            });
        });

        backBtn.addEventListener('click', () => closeCategory());
    }

    function openCategory(categoryId) {
        const title = portfolioData.categories[categoryId] || categoryId;
        const projects = portfolioData.projects.filter(p => p.categoryId === categoryId && p.status !== 'draft');

        submenuGrid.innerHTML = '';
        projects.forEach(proj => {
            const card = document.createElement('div');
            card.className = 'portfolio-project-card';
            card.setAttribute('data-case', proj.id);
            card.setAttribute('aria-label', proj.title);
            card.innerHTML = `
                ${proj.logo ? `<div class="project-logo-wrapper"><img src="${proj.logo}" class="project-logo" alt="${proj.title} logo"></div>` : `<div class="project-logo-fallback">${proj.title}</div>`}
            `;
            
            card.addEventListener('click', () => {
                if (proj.isExternal && proj.externalUrl) {
                    window.open(proj.externalUrl, '_blank');
                } else {
                    openModal(proj);
                }
            });

            submenuGrid.appendChild(card);
        });

        submenuTitle.textContent = title;

        mainGrid.style.display = 'none';
        submenuContainer.style.display = 'flex';
        
        if (window.gsap) {
            gsap.fromTo(submenuContainer, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" });
        }
    }

    function closeCategory() {
        submenuContainer.style.display = 'none';
        mainGrid.style.display = 'grid';
        if (window.gsap) {
            gsap.fromTo(mainGrid, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" });
        }
    }

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
