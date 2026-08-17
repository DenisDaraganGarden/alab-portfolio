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
            const imgs = (block.images || []).map(src => `<img src="${escapeAttr(src)}" alt=""/>`).join('');
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

        case 'compare': {
            if (!block.before || !block.after) return '';
            const uid = nextCompareId();
            return wrapReveal(block, `<div class="case-block-compare" id="${uid}"><img src="${escapeAttr(block.after)}" class="cmp-after" alt=""/><div class="cmp-before"><img src="${escapeAttr(block.before)}" class="cmp-before-img" alt=""/></div><div class="cmp-line"></div><span class="cmp-label cmp-label--before">ДО</span><span class="cmp-label cmp-label--after">ПОСЛЕ</span></div>`);
        }

        case 'quote':
            return wrapReveal(block, `<blockquote class="case-block-quote"><p class="case-quote-text">${escapeHtml(block.text || '')}</p><div class="case-quote-author">${block.photo ? `<img class="case-quote-photo" src="${escapeAttr(block.photo)}" alt=""/>` : ''}<div><strong>${escapeHtml(block.author || '')}</strong>${block.role ? `<br><span class="case-quote-role">${escapeHtml(block.role)}</span>` : ''}</div></div></blockquote>`);

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
