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
            card.innerHTML = `
                ${proj.logo ? `<div class="project-logo-wrapper"><img src="${proj.logo}" class="project-logo" alt="${proj.title} logo"></div>` : ''}
                <div class="project-info">
                    <h3 class="project-title">${proj.title}</h3>
                </div>
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

    if (!modal || !modalScrollArea || !modalContent) return;

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
                        modalContent.innerHTML += `<${lvl} class="case-block-heading">${block.content || ''}</${lvl}>`;
                        break;
                    }
                    case 'text':
                        modalContent.innerHTML += `<p class="case-block-text">${(block.content||'').replace(/\n/g,'<br>')}</p>`;
                        break;
                    case 'image':
                        if (block.content) {
                            const mask = block.mask ? `clip-path: url(#${block.mask});` : '';
                            modalContent.innerHTML += `<div class="case-block-image"><img src="${block.content}" alt="" style="${mask}"/></div>`;
                        }
                        break;
                    case 'video':
                        if (block.content) modalContent.innerHTML += `<div class="case-block-video"><video src="${block.content}" autoplay muted loop playsinline></video></div>`;
                        break;
                    case 'gallery': {
                        const imgs = (block.images||[]).map(src => `<img src="${src}" alt=""/>`).join('');
                        modalContent.innerHTML += `<div class="case-block-gallery">${imgs}</div>`;
                        break;
                    }
                    case 'spacer':
                        modalContent.innerHTML += `<div style="height:${block.height||80}px"></div>`;
                        break;
                    case 'masked_image':
                        if (block.content) {
                            const cp = block.clipPath || 'circle(50% at 50% 50%)';
                            modalContent.innerHTML += `<div class="case-block-image"><img src="${block.content}" alt="" style="clip-path:${cp};"/></div>`;
                        }
                        break;
                }
            });
        }
        
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
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) closeModal(); });
}
