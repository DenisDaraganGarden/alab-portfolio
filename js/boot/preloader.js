/**
 * [A.LAB] Оркестратор предзагрузки.
 *
 * Отображением занимается инлайн-привратник в <head> index.html — он
 * закрашивает оверлей первым же кадром, считает процент и держит лок
 * скролла. Этот модуль ведёт вторую половину: дожидается картинок,
 * стабилизирует вёрстку, пересчитывает скролл-сцены и отдаёт управление
 * сайту.
 *
 * Ключевой инвариант: ни одна секция не инициализируется до закрытия
 * шрифтового шлюза, поэтому все измерения на ините делаются по финальным
 * метрикам Unbounded, а не по фолбэку cursive.
 */

const boot = () => window.__ALAB_BOOT;

const mark = (id) => { try { boot()?.mark(id); } catch (e) {} };
const retire = (id) => { try { boot()?.retire(id); } catch (e) {} };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Кадр с подстраховкой таймером: в фоновой вкладке requestAnimationFrame
 * не вызывается вовсе, и вся цепочка загрузки замерла бы до дедлайна.
 */
export const nextFrame = () => new Promise((resolve) => {
    // В скрытой вкладке кадров нет вовсе, а таймеры придушены до секунды:
    // ждать отрисовки там бессмысленно и дорого. Актуальность позиций
    // восстанавливает пересчёт при возврате на вкладку.
    if (document.hidden) { resolve(); return; }
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(finish);
    setTimeout(finish, 60);
});

export const hasGsap = () => typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';

/**
 * Ожидание группы единиц загрузки. Всегда резолвится — либо по готовности,
 * либо по подтаймауту внутри привратника.
 */
export const gate = (group, timeout) => {
    const bus = boot();
    if (!bus || typeof bus.gate !== 'function') return Promise.resolve();
    return bus.gate(group, timeout);
};

/* ─────────────────────────────────────────────────────────────────────
   Общий промис настроек: и portfolio.js, и hero.js читают settings.json.
   Раньше это были два независимых запроса, причём hero ходил с
   cache:'no-store' и мог подвисать произвольно долго.
   ───────────────────────────────────────────────────────────────────── */
let settingsPromise = null;

export const loadSettings = () => {
    if (settingsPromise) return settingsPromise;
    settingsPromise = fetchJson('/data/settings.json', 4000)
        .then((data) => { mark('data:settings'); return data; })
        .catch(() => { retire('data:settings'); return null; });
    return settingsPromise;
};

export const fetchJson = async (url, timeoutMs = 4000) => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);
    try {
        const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
};

/* ─────────────────────────────────────────────────────────────────────
   Фаза 5 — картинки
   ───────────────────────────────────────────────────────────────────── */

const MEDIA_SLOTS = 6;

const collectMediaManifest = () => {
    const logos = Array.from(document.querySelectorAll('#portfolio img.project-logo'));
    const qr = document.querySelector('img.contacts-qr');
    return [...logos, qr].filter(Boolean).slice(0, MEDIA_SLOTS);
};

const decodeAll = async () => {
    const images = collectMediaManifest();

    // Незанятые слоты выпадают из знаменателя, иначе процент не дойдёт до 100
    for (let i = images.length; i < MEDIA_SLOTS; i += 1) retire(`media:${i}`);

    await Promise.all(images.map((img, index) => {
        const done = () => mark(`media:${index}`);

        const loaded = new Promise((resolve) => {
            if (img.complete) { resolve(); return; }
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        });

        // В скрытой вкладке декодирование откладывается браузером и
        // img.decode() не резолвится вовсе — там ограничиваемся фактом
        // загрузки. Битая ссылка в cases.json тоже не должна стоить
        // пользователю секунд, поэтому у всего есть потолок.
        const ready = document.hidden || typeof img.decode !== 'function'
            ? loaded
            : loaded.then(() => img.decode()).catch(() => {});

        return Promise.race([ready, sleep(1800)]).catch(() => {}).then(done);
    }));
};

/* ─────────────────────────────────────────────────────────────────────
   Фаза 6 — стабилизация вёрстки
   ───────────────────────────────────────────────────────────────────── */

const measure = () => {
    const subtitle = document.querySelector('.hero-subtitle');
    const rect = subtitle ? subtitle.getBoundingClientRect() : { width: 0, height: 0 };
    return `${document.documentElement.scrollHeight}|${Math.round(rect.width)}|${Math.round(rect.height)}`;
};

const settleLayout = async () => {
    await nextFrame();
    await nextFrame();
    mark('layout:metrics');

    // В скрытой вкладке вёрстка всё равно не рисуется, а таймеры и кадры
    // придушены — проба стабильности там только тянет время. Страховочный
    // пересчёт на window.load и fonts.loadingdone остаётся.
    if (document.hidden) { mark('layout:settle'); return; }

    // Проба стабильности: два одинаковых замера подряд означают, что
    // перетекание текста закончилось и мерить можно.
    const deadline = performance.now() + 250;
    let previous = measure();
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await nextFrame();
        const current = measure();
        if (current === previous || performance.now() > deadline) break;
        previous = current;
    }
    mark('layout:settle');
};

/* ─────────────────────────────────────────────────────────────────────
   Фазы 7-8 — снятие лока и пересчёт скролл-сцен
   ───────────────────────────────────────────────────────────────────── */

const setInert = (on) => {
    ['#smooth-wrapper', '#global-header'].forEach((selector) => {
        const node = document.querySelector(selector);
        if (!node) return;
        if (on) {
            node.setAttribute('aria-hidden', 'true');
            if ('inert' in node) node.inert = true;
        } else {
            node.removeAttribute('aria-hidden');
            if ('inert' in node) node.inert = false;
        }
    });
};

/**
 * Пересчёт скролл-сцен. Экспортируется наружу: сетка портфолио
 * перерисовывается при провале в категорию, и без этого вызова позиции
 * секции контактов протухают сразу после первого клика.
 */
export const refreshScrollScenes = async () => {
    if (!hasGsap()) return;
    await nextFrame();
    await nextFrame();
    try { ScrollTrigger.refresh(); } catch (e) {
        console.error('[A.LAB] ScrollTrigger.refresh:', e);
    }
};

/* ─────────────────────────────────────────────────────────────────────
   Фаза 11 — страховочные пересчёты после раскрытия
   ───────────────────────────────────────────────────────────────────── */

const installLateRefresh = () => {
    let revealedAt = performance.now();
    let lastHeight = document.documentElement.scrollHeight;

    const maybeRefresh = () => {
        const height = document.documentElement.scrollHeight;
        if (Math.abs(height - lastHeight) <= 2) return;
        if (performance.now() - revealedAt > 2600) return;
        lastHeight = height;
        refreshScrollScenes();
    };

    window.addEventListener('load', maybeRefresh, { once: true });

    // Вкладку могли открыть в фоне: там нет ни кадров, ни отрисовки, и
    // позиции считались по неотрисованной вёрстке. При первом показе
    // пересчитываем безусловно.
    if (document.hidden) {
        document.addEventListener('visibilitychange', function onShow() {
            if (document.hidden) return;
            document.removeEventListener('visibilitychange', onShow);
            lastHeight = document.documentElement.scrollHeight;
            refreshScrollScenes();
        });
    }

    // Сценарий soft-дедлайна: сайт раскрылся с недоехавшим Unbounded,
    // шрифт приземляется уже после — вёрстка обязана пересчитаться.
    if (document.fonts) {
        let timer = 0;
        const onDone = () => {
            clearTimeout(timer);
            timer = setTimeout(maybeRefresh, 250);
        };
        document.fonts.addEventListener?.('loadingdone', onDone, { once: true });
    }
};

/* ─────────────────────────────────────────────────────────────────────
   Главная последовательность
   ───────────────────────────────────────────────────────────────────── */

export const runPreloader = async () => {
    const bus = boot();

    try {
        await decodeAll();
        await settleLayout();
    } catch (error) {
        console.error('[A.LAB] Предзагрузка: ошибка стабилизации', error);
    }

    // Фаза 7. Лок снимается, пока оверлей ещё полностью непрозрачен и
    // ловит события: для пользователя разблокировка невидима.
    bus?.release();
    setInert(false);

    // Фаза 8. Пересчёт строго ПОСЛЕ снятия лока: html{overflow:hidden}
    // убирает десктопный скроллбар, вьюпорт становится шире, и строчная
    // разбивка (а с ней высота секций) считается по чужой ширине.
    // И строго ДО ухода оверлея: pin-spacer'ы физически меняют высоту
    // документа, и этот рывок пользователь видеть не должен.
    await refreshScrollScenes();
    mark('layout:refresh');

    // Фаза 9. Возврат позиции: якорь, снятый привратником до первой
    // отрисовки, либо сохранённая при уходе прокрутка. Делается уже после
    // пересчёта, то есть по настоящей геометрии страницы.
    const hash = bus?.bootHash;
    if (hash) {
        try {
            history.replaceState(null, '', location.pathname + location.search + hash);
            document.querySelector(hash)?.scrollIntoView({ behavior: 'auto', block: 'start' });
            await refreshScrollScenes();
        } catch (e) {}
    } else if (bus?.savedScrollY > 0) {
        try {
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            window.scrollTo(0, Math.min(bus.savedScrollY, Math.max(0, maxScroll)));
        } catch (e) {}
    }

    installLateRefresh();

    // Фаза 10. Процент добивается до 100, выдерживается и уходит.
    await bus?.reveal('ready');
};
