/**
 * [A.LAB] Рендер блоков кейса — единственная реализация.
 *
 * Раньше их было две: боевая внутри js/sections/portfolio.js и отдельная
 * в предпросмотре редактора, с другой вёрсткой и захардкоженными инлайн-
 * стилями. Предпросмотр показывал не то, что окажется на сайте, а каждый
 * новый тип блока приходилось писать дважды.
 *
 * Модуль намеренно чистый: только строки, никакого DOM и никакого состояния.
 * Всё, что требует слушателей, живёт в hydrate-функциях внизу и вызывается
 * тем, кто вставил разметку.
 */

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

export const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const escapeAttr = (value = '') => escapeHtml(value).replace(/`/g, '&#96;');

export const normalizeLinkUrl = (value, platform = '') => {
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

export const displayLinkUrl = (value) => String(value || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^mailto:/i, '')
    .replace(/^tel:/i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');

/**
 * Разбор ссылки в видео-блоке: прямой файл (.mp4/.webm/...) отдаём в <video>,
 * ссылку на страницу VK Video / YouTube / Vimeo / Rutube — во встраиваемый
 * iframe. Хостинга своих видео нет, поэтому длинные ролики живут во внешних
 * плеерах (для РФ — VK Video), а короткие можно грузить файлом в кейс.
 */
export const parseVideoEmbed = (rawUrl = '') => {
    let url = String(rawUrl || '').trim();
    if (!url) return null;
    if (/^(javascript|data|vbscript):/i.test(url)) return null;

    // Схемелесс-хост (www.site.ru/clip.mp4, vk.com/...) — как в normalizeLinkUrl
    // для блока ссылок: дописываем https, чтобы дальше работал разбор хостов.
    if (!url.startsWith('/') && /^(?:www\.|[\w-]+(?:\.[\w-]+)+)(?:[/?#]|$)/i.test(url)) {
        url = 'https://' + url;
    }

    // Хосты заякорены на схему — иначе not-youtube.com/embed/… ложно совпал бы.
    let m = url.match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)([\w-]{6,})/i)
         || url.match(/^https?:\/\/youtu\.be\/([\w-]{6,})/i);
    if (m) return { kind: 'embed', embedUrl: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0` };

    m = url.match(/^https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)/i);
    if (m) return { kind: 'embed', embedUrl: `https://player.vimeo.com/video/${m[1]}` };

    m = url.match(/^https?:\/\/(?:www\.)?(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/i);
    if (m) return { kind: 'embed', embedUrl: `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}` };
    if (/^https?:\/\/(?:www\.)?(?:vk\.com|vkvideo\.ru)\/video_ext\.php\?/i.test(url)) return { kind: 'embed', embedUrl: url };

    m = url.match(/^https?:\/\/(?:www\.)?rutube\.ru\/(?:video|play\/embed)\/(\w+)/i);
    if (m) return { kind: 'embed', embedUrl: `https://rutube.ru/play/embed/${m[1]}` };

    // Прямой файл — ТОЛЬКО то, что похоже на медиа (расширение). Незнакомую
    // ссылку/страницу плеера, не попавшую под шаблоны выше, возвращаем как null,
    // чтобы блок не отрисовался пустым <video> (opacity:0 без события playing).
    if (/\.(?:mp4|webm|ogv|ogg|mov|m4v)(?:[?#]|$)/i.test(url) && (/^https?:\/\//i.test(url) || url.startsWith('/'))) {
        return { kind: 'file', src: url };
    }
    return null;
};

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

const wrapReveal = (block, html) => {
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

/**
 * Блок «Процесс» — методология проекта живым текстом вместо картинки.
 * Разметка внутри текста шага:
 *   ### подзаголовок   — заголовок смысловой группы
 *   **жирный**         — важное, тёмным
 *   ==акцент==         — ключевая мысль цветом кейса (маркерная подсветка)
 *   пустая строка      — новый абзац
 * Обычный текст — приглушённый серый, как в первоисточнике.
 */
const renderProcessRich = (value = '') => escapeHtml(value)
    .replace(/==([^=\n]+)==/g, '<mark class="case-process-accent">$1</mark>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

const renderProcessStep = (step, index) => {
    const lines = String(step.text || '').split(/\n/);
    const parts = [];
    let paragraph = [];
    let itemIndex = 0;
    const flush = () => {
        if (!paragraph.length) return;
        parts.push(`<p class="case-process-p" style="--item-i:${itemIndex++}">${paragraph.join('<br>')}</p>`);
        paragraph = [];
    };
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) { flush(); continue; }
        if (/^#{2,4}\s*/.test(line)) {
            flush();
            parts.push(`<h4 class="case-process-h" style="--item-i:${itemIndex++}">${renderProcessRich(line.replace(/^#{2,4}\s*/, ''))}</h4>`);
            continue;
        }
        paragraph.push(renderProcessRich(line));
    }
    flush();
    return `<div class="case-process-step" style="--step-i:${index}"><h3 class="case-process-title">${renderProcessRich(step.title || '')}</h3>${parts.join('')}</div>`;
};

let compareSeq = 0;
const nextCompareId = () => `cmp-${(compareSeq += 1).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Разметка одного блока. Возвращает пустую строку, если показывать нечего —
 * вызывающий по этому и определяет, есть ли у кейса контент.
 */
export function renderCaseBlock(block) {
    if (!block || block.enabled === false) return '';

    switch (block.type) {
        case 'raw_html':
            return String(block.content || '');

        case 'heading': {
            const lvl = block.level || 'h2';
            return wrapReveal(block, `<${lvl} class="case-block-heading">${renderAnimatedText(block.content, blockAnimation(block))}</${lvl}>`);
        }

        case 'text':
            return wrapReveal(block, `<p class="case-block-text">${renderAnimatedText(block.content, blockAnimation(block))}</p>`);

        case 'image': {
            if (!block.content) return '';
            const mask = block.mask ? `clip-path: url(#${escapeAttr(block.mask)});` : '';
            return wrapReveal(block, `<div class="case-block-image"><img src="${escapeAttr(block.content)}" alt="" style="${mask}"/></div>`);
        }

        case 'video': {
            if (!block.content) return '';
            const media = parseVideoEmbed(block.content);
            if (!media) return '';
            if (media.kind === 'embed') {
                return wrapReveal(block, `<div class="case-block-video case-block-video--embed"><iframe src="${escapeAttr(media.embedUrl)}" loading="lazy" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="Видео"></iframe></div>`);
            }
            // Прямой файл: ленивая подгрузка и автоплей отданы hydrateCaseMedia
            // (viewport-gating, плавное появление, пауза вне экрана, учёт
            // prefers-reduced-motion). preload='none' и data-src — чтобы видео
            // не тянулось, пока кейс не открыт и блок не в зоне видимости.
            const poster = block.poster ? ` poster="${escapeAttr(block.poster)}"` : '';
            return wrapReveal(block, `<div class="case-block-video"><video class="case-video" data-src="${escapeAttr(media.src)}"${poster} muted loop playsinline preload="none"></video></div>`);
        }

        case 'gallery': {
            const images = block.images || [];
            if (!images.length) return '';
            // «Карусель»: лента фото-карточек без подписей и рамок — мудборды,
            // слайды, серии. Листается свайпом/скроллом, стрелки вешает
            // hydrateCaseSliders.
            if (block.layout === 'slider') {
                const dark = block.background === 'dark';
                const slides = images.map(src => `<div class="case-slide"><img src="${escapeAttr(src)}" alt="" loading="lazy"/></div>`).join('');
                const total = String(images.length).padStart(2, '0');
                return wrapReveal(block, `<div class="case-block-slider${dark ? ' case-block-slider--dark' : ''}"><div class="case-slider-track" tabindex="0" role="region" aria-label="Галерея, листается горизонтально">${slides}</div><button class="case-slider-arrow case-slider-arrow--prev" type="button" aria-label="Назад">←</button><button class="case-slider-arrow case-slider-arrow--next" type="button" aria-label="Вперёд">→</button><div class="case-slider-hud"><span class="case-slider-count"><b>01</b><span>/ ${total}</span></span><span class="case-slider-progress"><i></i></span></div></div>`);
            }
            const imgs = images.map(src => `<img src="${escapeAttr(src)}" alt=""/>`).join('');
            return wrapReveal(block, `<div class="case-block-gallery">${imgs}</div>`);
        }

        case 'links':
            return wrapReveal(block, renderLinksBlock(block));

        case 'spacer':
            return `<div style="height:${Number(block.height) || 80}px"></div>`;

        case 'masked_image': {
            if (!block.content) return '';
            const cp = escapeAttr(block.clipPath || 'circle(50% at 50% 50%)');
            return wrapReveal(block, `<div class="case-block-image"><img src="${escapeAttr(block.content)}" alt="" style="clip-path:${cp};"/></div>`);
        }

        case 'columns':
            return wrapReveal(block, renderColumnsBlock(block));

        case 'process': {
            const steps = (block.steps || []).filter(s => String(s?.title || '').trim() || String(s?.text || '').trim());
            if (!steps.length) return '';
            const arrowSvg = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.8 17.4 12 7 19.2z"/></svg>';
            const parts = [];
            steps.forEach((step, index) => {
                if (index) parts.push(`<span class="case-process-arrow" style="--step-i:${index}" aria-hidden="true">${arrowSvg}</span>`);
                parts.push(renderProcessStep(step, index));
            });
            // Блок всегда анимирован: шаги и стрелки проявляются каскадом,
            // акценты подсвечиваются «маркером» после появления шага.
            return `<div class="case-block-reveal" data-animation="process"><section class="case-block-process">${parts.join('')}</section></div>`;
        }

        case 'compare': {
            if (!block.before || !block.after) return '';
            const uid = nextCompareId();
            return wrapReveal(block, `<div class="case-block-compare" id="${uid}"><img src="${escapeAttr(block.after)}" class="cmp-after" alt=""/><div class="cmp-before"><img src="${escapeAttr(block.before)}" class="cmp-before-img" alt=""/></div><div class="cmp-line"></div><span class="cmp-label cmp-label--before">ДО</span><span class="cmp-label cmp-label--after">ПОСЛЕ</span></div>`);
        }

        case 'quote': {
            const inner = `<p class="case-quote-text">${escapeHtml(block.text || '')}</p><div class="case-quote-author">${block.photo ? `<img class="case-quote-photo" src="${escapeAttr(block.photo)}" alt=""/>` : ''}<div><strong>${escapeHtml(block.author || '')}</strong>${block.role ? `<br><span class="case-quote-role">${escapeHtml(block.role)}</span>` : ''}</div></div>`;
            // «Жидкий металл»: вместо плашки — WebGL-ртуть (hydrateQuoteMetal).
            // Canvas рисует форму, текст остаётся обычным HTML поверх.
            if (block.look === 'metal') {
                return wrapReveal(block, `<blockquote class="case-block-quote case-quote-metal"><canvas class="case-quote-metal-canvas" aria-hidden="true"></canvas><div class="case-quote-metal-inner">${inner}</div></blockquote>`);
            }
            return wrapReveal(block, `<blockquote class="case-block-quote">${inner}</blockquote>`);
        }

        case 'metrics':
            return wrapReveal(block, `<div class="case-block-metrics">${(block.items || []).map(m => `<div class="case-metric"><div class="case-metric-value">${escapeHtml(m.value || '')}</div><div class="case-metric-label">${escapeHtml(m.label || '')}</div></div>`).join('')}</div>`);

        default:
            return '';
    }
}

/**
 * Разметка всего кейса одной строкой. Вставлять её нужно ОДНИМ присваиванием:
 * сборка через innerHTML += в цикле пересоздаёт весь уже собранный DOM,
 * перезапускает каждое video и позволяет незакрытому тегу в raw_html
 * поглотить следующие блоки.
 */
export function renderCaseBlocks(blocks = []) {
    if (!Array.isArray(blocks)) return '';
    const parts = [];
    for (const block of blocks) {
        const html = renderCaseBlock(block);
        if (html) parts.push(html);
    }
    return parts.join('');
}

/**
 * Слушатели для блоков сравнения «до/после». Вызывается ПОСЛЕ вставки
 * разметки в документ.
 */
export function hydrateCompareBlocks(root = document) {
    root.querySelectorAll('.case-block-compare').forEach((el) => {
        if (el.dataset.compareReady === '1') return;
        el.dataset.compareReady = '1';

        const before = el.querySelector('.cmp-before');
        const line = el.querySelector('.cmp-line');
        if (!before || !line) return;

        const onMove = (x) => {
            const rect = el.getBoundingClientRect();
            if (!rect.width) return;
            const pct = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
            before.style.clipPath = `polygon(0 0, ${pct}% 0, ${pct}% 100%, 0 100%)`;
            line.style.left = `${pct}%`;
        };

        el.addEventListener('mousemove', (event) => onMove(event.clientX));
        el.addEventListener('touchmove', (event) => {
            event.preventDefault();
            onMove(event.touches[0].clientX);
        }, { passive: false });
    });
}

/**
 * Оживление файловых видео-блоков кейса (.case-video[data-src]). Вызывается
 * ПОСЛЕ вставки разметки. Делает то, что нельзя выразить чистой строкой:
 *  • ленивая подгрузка — src подключается только когда блок входит в кадр;
 *  • автоплей/пауза по видимости — видео не молотит за пределами экрана;
 *  • плавное появление (класс is-playing) и лёгкое затухание на стыке
 *    цикла (is-looping), чтобы петля не «дёргалась»;
 *  • prefers-reduced-motion — вместо автоплея обычный плеер с controls.
 * iframe-эмбеды (VK/YouTube/Vimeo) грузятся сами через loading="lazy".
 */
export function hydrateCaseMedia(root = document) {
    const videos = root.querySelectorAll('.case-video[data-src]');
    if (!videos.length) return;

    const reduceMotion = typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)').matches;

    videos.forEach((video) => {
        if (video.dataset.mediaReady === '1') return;
        video.dataset.mediaReady = '1';

        const wrap = video.closest('.case-block-video');
        const attachSource = () => {
            if (!video.getAttribute('src')) {
                video.setAttribute('src', video.dataset.src);
                video.load();
            }
        };

        if (reduceMotion) {
            attachSource();
            video.setAttribute('controls', '');
            video.loop = false;
            wrap && wrap.classList.add('is-playing');
            return;
        }

        // Показываем видео, как только есть первый кадр — постер/кадр виден и
        // тогда, когда автоплей заблокирован (иначе opacity:0 держал бы блок
        // пустым). Класс тот же, что и при старте воспроизведения.
        const reveal = () => wrap && wrap.classList.add('is-playing');
        video.addEventListener('loadeddata', reveal);
        video.addEventListener('playing', reveal);
        video.addEventListener('timeupdate', () => {
            if (!video.duration || Number.isNaN(video.duration)) return;
            const remaining = video.duration - video.currentTime;
            wrap && wrap.classList.toggle('is-looping', remaining < 0.45);
        });

        if (typeof IntersectionObserver !== 'function') {
            attachSource();
            video.play().catch(() => {});
            return;
        }

        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    attachSource();
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.25 });
        io.observe(video);
        video._mediaIO = io;  // чтобы teardownCaseMedia мог отключить наблюдатель
    });
}

/**
 * Оживление каруселей галерей (.case-block-slider). Базовый слой — нативный
 * scroll-snap, поэтому без hydrate карусель всё равно листается свайпом.
 * Hydrate добавляет:
 *  • стрелки с гашением на краях;
 *  • счётчик «01 / N» и линию прогресса;
 *  • фокус-эффект — карточки у краёв экрана мягко уменьшаются и тускнеют;
 *  • на десктопе (hover+мышь): драг с инерцией — «флик» доводит до карточки,
 *    и вертикальное колесо листает ленту (на краях отдаёт скролл странице).
 */
export function hydrateCaseSliders(root = document) {
    root.querySelectorAll('.case-block-slider').forEach((el) => {
        if (el.dataset.sliderReady === '1') return;
        el.dataset.sliderReady = '1';

        const track = el.querySelector('.case-slider-track');
        if (!track) return;
        const slides = Array.from(track.querySelectorAll('.case-slide'));
        if (!slides.length) return;
        const counterEl = el.querySelector('.case-slider-count b');
        const progressEl = el.querySelector('.case-slider-progress i');

        const maxScroll = () => Math.max(0, track.scrollWidth - track.clientWidth);
        const padLeft = () => parseFloat(getComputedStyle(track).paddingLeft) || 0;
        // Позиции, в которых слайд встаёт на сетку контента. Ширины слайдов
        // разные (по пропорциям кадра), поэтому шаг не фиксированный.
        const anchors = () => slides.map(s => Math.min(Math.max(0, s.offsetLeft - padLeft()), maxScroll()));

        // Фокус-эффект, счётчик, прогресс и края — одним проходом в rAF
        let raf = 0;
        const paint = () => {
            raf = 0;
            const r = track.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            let active = 0;
            let bestDist = Infinity;
            slides.forEach((s, i) => {
                const sr = s.getBoundingClientRect();
                const dist = Math.abs(sr.left + sr.width / 2 - cx);
                s.style.setProperty('--slide-f', Math.min(1, dist / (r.width * 0.62)).toFixed(3));
                if (dist < bestDist) { bestDist = dist; active = i; }
            });
            if (counterEl) counterEl.textContent = String(active + 1).padStart(2, '0');
            const m = maxScroll();
            if (progressEl) progressEl.style.transform = `scaleX(${m > 0 ? (track.scrollLeft / m).toFixed(4) : 1})`;
            el.classList.toggle('is-start', track.scrollLeft <= 4);
            el.classList.toggle('is-end', track.scrollLeft >= m - 4);
        };
        const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

        const goTo = (left) => track.scrollTo({ left, behavior: 'smooth' });
        el.querySelector('.case-slider-arrow--prev')?.addEventListener('click', () => {
            const pts = anchors();
            const before = pts.filter(a => a < track.scrollLeft - 4);
            goTo(before.length ? before[before.length - 1] : 0);
        });
        el.querySelector('.case-slider-arrow--next')?.addEventListener('click', () => {
            const next = anchors().find(a => a > track.scrollLeft + 4);
            goTo(next != null ? next : maxScroll());
        });

        track.addEventListener('scroll', schedule, { passive: true });
        track.addEventListener('load', schedule, true); // картинки догрузились — ширины изменились
        window.addEventListener('resize', schedule);
        schedule();

        // Дальше — только десктоп с мышью: драг и колесо. На таче нативный
        // свайп с mandatory-снапом лучше любых обработчиков.
        if (!(typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches)) return;
        el.classList.add('is-enhanced');

        let dragging = false;
        let dragMoved = false;
        let startX = 0;
        let startLeft = 0;
        let lastX = 0;
        let lastT = 0;
        let velocity = 0; // px/ms, знак — направление движения курсора

        track.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'mouse' || e.button !== 0) return;
            dragging = true;
            dragMoved = false;
            startX = lastX = e.clientX;
            startLeft = track.scrollLeft;
            lastT = performance.now();
            velocity = 0;
            el.classList.add('is-dragging');
            track.setPointerCapture(e.pointerId);
        });
        track.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const now = performance.now();
            velocity = (e.clientX - lastX) / Math.max(1, now - lastT);
            lastX = e.clientX;
            lastT = now;
            if (Math.abs(e.clientX - startX) > 4) dragMoved = true;
            track.scrollLeft = startLeft - (e.clientX - startX);
        });
        const endDrag = () => {
            if (!dragging) return;
            dragging = false;
            el.classList.remove('is-dragging');
            // Инерция флика: проецируем скорость вперёд и доводим до ближайшей
            // карточки — отпустил с разгоном, и лента сама долистнула.
            const projected = track.scrollLeft - velocity * 260;
            let target = 0;
            let best = Infinity;
            anchors().forEach((a) => {
                const d = Math.abs(a - projected);
                if (d < best) { best = d; target = a; }
            });
            goTo(target);
        };
        track.addEventListener('pointerup', endDrag);
        track.addEventListener('pointercancel', endDrag);
        // После драга «клик» по карточке — случайность, гасим
        track.addEventListener('click', (e) => {
            if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; }
        }, true);

        // Вертикальное колесо листает ленту; на краях — отдаём скролл странице
        track.addEventListener('wheel', (e) => {
            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            const m = maxScroll();
            if ((delta < 0 && track.scrollLeft <= 0) || (delta > 0 && track.scrollLeft >= m - 1)) return;
            e.preventDefault();
            track.scrollLeft += delta;
        }, { passive: false });
    });
}

/**
 * «Жидкий металл» для цитат (.case-quote-metal): WebGL-шейдер рисует
 * ртутную плашку — округлая форма с фасками и хром-отражениями медленно
 * морфится шумом, курсор вдавливает поверхность и слегка сдвигает форму
 * (параллакс). Текст — обычный HTML поверх канваса. Без WebGL или при
 * prefers-reduced-motion остаётся спокойная версия: класс is-flat
 * возвращает обычную плашку (CSS), либо рендерится один статичный кадр.
 */
const QUOTE_METAL_FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_hover;
uniform float u_dpr;
/* Масштаб геометрии формы: на маленьком канвасе (мобайл) фаска, волна
   кромки и радиус углов ужимаются, оставляя место тексту */
uniform float u_shape;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
}
float sdRoundedBox(vec2 p, vec2 b, float r){
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
/* Высота поверхности: фаска у края + лёгкая рябь + вмятина под курсором */
float surface(vec2 px){
    vec2 c = u_res * 0.5;
    vec2 p = px - c;
    float t = u_time * 0.12;
    /* морфинг контура: край гуляет шумом, у каждой точки — своя фаза */
    float wob = (fbm(p * (0.0022 / u_dpr) + vec2(t, -t * 0.7)) - 0.5) * 28.0 * u_dpr * u_shape;
    vec2 b = c - vec2(20.0 * u_dpr * u_shape);
    /* радиус углов дышит, но ограничен в пикселях — на широких плашках
       углы не срезают место под текст */
    float r = min(min(b.x, b.y) * 0.75, (112.0 + 22.0 * sin(u_time * 0.07)) * u_dpr * u_shape);
    float d = sdRoundedBox(p, b, r) + wob;
    float bevel = 34.0 * u_dpr * u_shape;
    /* косинусный профиль — фаска без «ступенек» */
    float hgt = sin(clamp(-d / bevel, 0.0, 1.0) * 1.5708);
    /* рябь поверхности */
    hgt += (fbm(p * (0.004 / u_dpr) - vec2(t * 0.8, t * 0.5)) - 0.5) * 0.09;
    /* ртутная вмятина под курсором */
    float dm = length(px - u_mouse) / (150.0 * u_dpr);
    hgt -= u_hover * 0.45 * exp(-dm * dm);
    return hgt;
}
float sdf(vec2 px){
    vec2 c = u_res * 0.5;
    vec2 p = px - c;
    float t = u_time * 0.12;
    float wob = (fbm(p * (0.0022 / u_dpr) + vec2(t, -t * 0.7)) - 0.5) * 28.0 * u_dpr * u_shape;
    vec2 b = c - vec2(20.0 * u_dpr * u_shape);
    float r = min(min(b.x, b.y) * 0.75, (112.0 + 22.0 * sin(u_time * 0.07)) * u_dpr * u_shape);
    return sdRoundedBox(p, b, r) + wob;
}
void main(){
    vec2 px = gl_FragCoord.xy;
    px.y = u_res.y - px.y;
    float d = sdf(px);
    float aa = 1.6 * u_dpr;
    float alpha = smoothstep(aa, -aa, d);
    if (alpha <= 0.001) { gl_FragColor = vec4(0.0); return; }

    float e = 2.0 * u_dpr;
    float hC = surface(px);
    float hX = surface(px + vec2(e, 0.0));
    float hY = surface(px + vec2(0.0, e));
    float depth = 26.0 * u_dpr;
    vec3 n = normalize(vec3((hC - hX) * depth / e, (hC - hY) * depth / e, 1.0));

    vec3 l = normalize(vec3(-0.38 + 0.1 * sin(u_time * 0.2), -0.62, 0.72));
    float diff = 0.5 + 0.5 * dot(n, l);

    /* хром: вертикальный градиент неба + мягкие полосы отражений */
    float sky = clamp(0.5 - n.y * 0.75, 0.0, 1.0);
    vec3 env = mix(vec3(0.56, 0.575, 0.615), vec3(0.97, 0.975, 0.985), sky);
    /* хром-полосы только на плоскости — на фаске от них рябь */
    float streak = sin((n.x * 2.4 + n.y * 4.2 + px.y * 0.0016 / u_dpr + u_time * 0.05) * 6.2831);
    env += streak * 0.07 * smoothstep(0.75, 1.0, hC);

    vec3 v = vec3(0.0, 0.0, 1.0);
    vec3 rl = reflect(-l, n);
    float spec = pow(max(dot(rl, v), 0.0), 64.0) * 0.85;
    float fres = pow(1.0 - max(n.z, 0.0), 2.6);

    vec3 col = env * mix(0.82, 1.12, diff);
    col += spec;
    col += fres * vec3(0.10, 0.105, 0.115);
    /* затемнение фаски — объём по краю */
    col *= mix(0.68, 1.0, smoothstep(0.0, 0.55, hC));

    gl_FragColor = vec4(col * alpha, alpha);
}`;

export function hydrateQuoteMetal(root = document) {
    const reduceMotion = typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)').matches;

    root.querySelectorAll('.case-quote-metal').forEach((quote) => {
        if (quote.dataset.metalReady === '1') return;
        quote.dataset.metalReady = '1';

        const canvas = quote.querySelector('.case-quote-metal-canvas');
        const gl = canvas && (canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })
            || canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: true }));
        if (!gl) { quote.classList.add('is-flat'); return; }

        const compile = (type, src) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
        };
        const vs = compile(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}');
        const fs = compile(gl.FRAGMENT_SHADER, QUOTE_METAL_FRAG);
        if (!vs || !fs) { quote.classList.add('is-flat'); return; }
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { quote.classList.add('is-flat'); return; }
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'a');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const U = (name) => gl.getUniformLocation(prog, name);
        const uRes = U('u_res'), uTime = U('u_time'), uMouse = U('u_mouse'), uHover = U('u_hover'), uDpr = U('u_dpr'), uShape = U('u_shape');

        let dpr = 1;
        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.max(1, Math.round(quote.clientWidth * dpr));
            const h = Math.max(1, Math.round(quote.clientHeight * dpr));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                gl.viewport(0, 0, w, h);
            }
        };

        /* курсор: сглаженное следование + лёгкий параллакс всей формы */
        let mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5, hover = 0, hoverT = 0;
        quote.addEventListener('pointermove', (e) => {
            const r = quote.getBoundingClientRect();
            tx = (e.clientX - r.left) / Math.max(1, r.width);
            ty = (e.clientY - r.top) / Math.max(1, r.height);
        });
        quote.addEventListener('pointerenter', () => { hoverT = 1; });
        quote.addEventListener('pointerleave', () => { hoverT = 0; tx = 0.5; ty = 0.5; });

        const t0 = performance.now();
        const frame = () => {
            resize();
            mx += (tx - mx) * 0.08;
            my += (ty - my) * 0.08;
            hover += (hoverT - hover) * 0.06;
            gl.uniform2f(uRes, canvas.width, canvas.height);
            gl.uniform1f(uTime, (performance.now() - t0) / 1000);
            gl.uniform2f(uMouse, mx * canvas.width, my * canvas.height);
            gl.uniform1f(uHover, hover);
            gl.uniform1f(uDpr, dpr);
            /* на узком/низком канвасе геометрия формы ужимается */
            gl.uniform1f(uShape, Math.min(1, Math.max(0.55, Math.min(quote.clientWidth, quote.clientHeight) / 560)));
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            /* параллакс: форма чуть тянется к курсору, текст — отстаёт */
            const ox = (mx - 0.5) * hover, oy = (my - 0.5) * hover;
            canvas.style.transform = `translate3d(${ox * 10}px, ${oy * 10}px, 0)`;
            const inner = quote.querySelector('.case-quote-metal-inner');
            if (inner) inner.style.transform = `translate3d(${ox * 4}px, ${oy * 4}px, 0)`;
        };

        if (reduceMotion) { frame(); return; }

        let raf = 0;
        const loop = () => { frame(); raf = requestAnimationFrame(loop); };
        if (typeof IntersectionObserver === 'function') {
            const io = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) { if (!raf) raf = requestAnimationFrame(loop); }
                    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
                });
            }, { rootMargin: '80px' });
            io.observe(quote);
            canvas._metalIO = io;
        } else {
            raf = requestAnimationFrame(loop);
        }
        window.addEventListener('resize', resize);
    });
}

/**
 * Отключение наблюдателей видео перед удалением разметки (закрытие модалки).
 * Без этого IntersectionObserver'ы держат ссылки на снятые с DOM <video>
 * с забуференным медиа и продолжают дёргать колбэки на мёртвых узлах.
 */
export function teardownCaseMedia(root = document) {
    root.querySelectorAll('.case-video').forEach((video) => {
        if (video._mediaIO) {
            video._mediaIO.disconnect();
            video._mediaIO = null;
        }
        try { video.pause(); } catch {}
    });
}
