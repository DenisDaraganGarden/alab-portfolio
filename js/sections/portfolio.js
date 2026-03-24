/**
 * [A.LAB] Portfolio Module
 * Handles interactions for the portfolio section, including the case study full-screen modal.
 */

export function initPortfolio(container) {
    console.log('[A.LAB] Инициализация Portfolio Module...');

    // Category routing and sub-menu logic
    const mainGrid = container.querySelector('#main-portfolio-grid');
    const submenuContainer = container.querySelector('#portfolio-submenu');
    const submenuGrid = container.querySelector('#portfolio-submenu-grid');
    const submenuTitle = container.querySelector('#portfolio-submenu-title');
    const backBtn = container.querySelector('#portfolio-back-btn');
    const categoryCards = container.querySelectorAll('.category-card');

    const projectsData = {
        development: [
            { id: 'domm', title: 'Девелопмент / Domm', logo: '/images/DOMM/logo-black.svg' },
            { id: 'architecture', title: 'Архитектурное бюро' }
        ],
        services: [
            { id: 'dentistry', title: 'Медицина и Стоматология' },
            { id: 'legal', title: 'Юридические услуги' }
        ],
        production: [
            { id: 'food', title: 'FMCG и Здоровая еда' },
            { id: 'manufacture', title: 'Производство оборудования' }
        ]
    };

    const categoryTitles = {
        development: 'Девелопмент и Архитектура',
        services: 'Услуги',
        production: 'Производство'
    };

    if (categoryCards && mainGrid && submenuContainer && backBtn) {
        categoryCards.forEach(card => {
            card.addEventListener('click', () => {
                const category = card.getAttribute('data-category');
                openCategory(category);
            });
        });

        backBtn.addEventListener('click', () => {
            closeCategory();
        });
    }

    function openCategory(category) {
        const projects = projectsData[category] || [];
        const title = categoryTitles[category] || category;

        // Render projects
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
            
            // Re-attach modal listener to new cards
            card.addEventListener('click', () => {
                const caseId = card.getAttribute('data-case');
                if (caseId) openModal(caseId);
            });

            submenuGrid.appendChild(card);
        });

        submenuTitle.textContent = title;

        // Animate transition
        mainGrid.style.display = 'none';
        submenuContainer.style.display = 'flex';
        
        // Optional GSAP if available
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

    // Modal logic (existing)
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

    if (!modal || !modalScrollArea || !modalContent) {
        console.warn('[A.LAB] Не удалось найти необходимые элементы Portfolio модулю');
        return;
    }

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
        const atTop = scrollTop <= CLOSE_THRESHOLD;
        const atBottom = scrollTop + clientHeight >= scrollHeight - CLOSE_THRESHOLD;

        if (direction < 0 && atTop) {
            closeModal();
        } else if (direction > 0 && atBottom) {
            closeModal();
        }
    };

    const handleModalScroll = () => {
        if (!isOpen || isClosing) return;

        const currentScrollTop = modalScrollArea.scrollTop;
        const direction = currentScrollTop > lastKnownScrollTop ? 1 : currentScrollTop < lastKnownScrollTop ? -1 : 0;
        lastKnownScrollTop = currentScrollTop;

        if (!direction) return;

        const maxScrollTop = Math.max(0, modalScrollArea.scrollHeight - modalScrollArea.clientHeight);
        if (direction > 0 && currentScrollTop >= maxScrollTop - CLOSE_THRESHOLD) {
            closeModal();
            return;
        }

        if (direction < 0 && currentScrollTop <= CLOSE_THRESHOLD) {
            closeModal();
        }
    };

    const openModal = (caseId) => {
        const template = document.getElementById(`tmpl-${caseId}`);
        if (template) {
            modalContent.innerHTML = '';
            modalContent.appendChild(template.content.cloneNode(true));
        } else {
            modalContent.innerHTML = `<div class="case-study-detail case-placeholder" style="padding: 10rem 5%; color: white;"><h2 class="placeholder-title" style="font-size: 3rem;">Кейс в разработке</h2><p class="placeholder-text">Описание для ${caseId} скоро появится.</p></div>`;
        }

        pageScrollBeforeOpen = window.scrollY || window.pageYOffset || 0;
        isOpen = true;
        isClosing = false;
        touchStartY = null;
        lastKnownScrollTop = 0;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        modalScrollArea.scrollTop = 0;

        if (window.lenis) {
            window.lenis.stop();
        } else {
            document.body.style.overflow = 'hidden';
        }
        
        requestAnimationFrame(() => {
            modalScrollArea.scrollTop = 0;
        });
    };

    modalScrollArea.addEventListener('scroll', handleModalScroll, { passive: true });
    
    modalScrollArea.addEventListener('wheel', (event) => {
        tryCloseFromScrollIntent(Math.sign(event.deltaY));
    }, { passive: true });

    modalScrollArea.addEventListener('touchstart', (event) => {
        touchStartY = event.touches[0]?.clientY ?? null;
    }, { passive: true });

    modalScrollArea.addEventListener('touchmove', (event) => {
        const currentTouchY = event.touches[0]?.clientY;
        if (touchStartY == null || currentTouchY == null) return;
        const deltaY = touchStartY - currentTouchY;
        tryCloseFromScrollIntent(Math.sign(deltaY));
    }, { passive: true });

    modalScrollArea.addEventListener('touchend', () => {
        touchStartY = null;
    }, { passive: true });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeModal();
        }
    });
}
