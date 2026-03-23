/**
 * [A.LAB] Portfolio Module
 * Handles interactions for the portfolio section, including the case study full-screen modal.
 */

export function initPortfolio(container) {
    console.log('[A.LAB] Инициализация Portfolio Module...');

    const cards = container.querySelectorAll('.portfolio-card');
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

    // Safety check
    if (!cards.length || !modal || !modalScrollArea || !modalContent) {
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
        const direction = currentScrollTop > lastKnownScrollTop
            ? 1
            : currentScrollTop < lastKnownScrollTop
                ? -1
                : 0;

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

    // Function to open the modal and populate it with the appropriate case study content
    const openModal = (caseId) => {
        // Find the template for the case ID
        const template = document.getElementById(`tmpl-${caseId}`);

        if (template) {
            // Clone the template content and inject it into the modal wrapper
            modalContent.innerHTML = '';
            modalContent.appendChild(template.content.cloneNode(true));
        } else {
            // Fallback if template doesn't exist
            modalContent.innerHTML = `<div class="case-study-detail case-placeholder"><h2 class="placeholder-title">Error</h2><p class="placeholder-text">Case study template not found.</p></div>`;
        }

        // Add 'is-open' class to reveal the modal
        pageScrollBeforeOpen = window.scrollY || window.pageYOffset || 0;
        isOpen = true;
        isClosing = false;
        touchStartY = null;
        lastKnownScrollTop = 0;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        modalScrollArea.scrollTop = 0;

        // Pause Lenis smooth scrolling to prevent background scroll interference
        if (window.lenis) {
            window.lenis.stop();
        } else {
            // Fallback for native scrolling
            document.body.style.overflow = 'hidden';
        }
        
        requestAnimationFrame(() => {
            modalScrollArea.scrollTop = 0;
        });
    };

    // Attach click events to portfolio cards
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const caseId = card.getAttribute('data-case');
            if (caseId) {
                openModal(caseId);
            }
        });
    });

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

    // Optional: Close modal on Escape key press
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeModal();
        }
    });
}
