/**
 * [A.LAB] Water Ripple — водная гладь в финале (секция contacts).
 *
 * Классическая двухбуферная симуляция высот (height-field):
 * усреднение соседей + затухание ~0.985. Рендер — мягкая лиловая
 * светотень на белом фоне: гребни ловят свет (почти белый),
 * впадины дают нежно-фиолетовую тень из палитры существующих
 * свечений сайта (rgba(232,187,255,…) → #cbb8dd-семейство).
 *
 * Перспектива: canvas лежит «полом» — CSS-transform
 * perspective(d) rotateX(θ) scale(s) с origin в нижнем центре.
 * GPU проецирует текстуру целиком (без по-строчных drawImage),
 * круги симуляции становятся сплюснутыми эллипсами, уходящими
 * в глубину. scale(s) подбирается на resize так, чтобы повёрнутая
 * плоскость перекрывала секцию по ширине на всех видимых строках;
 * лишнее клипается обёрткой overflow:hidden. Ввод указателя
 * пересчитывается точной обратной проекцией (см. unprojectLocal).
 *
 * Самодостаточный модуль: сам создаёт canvas внутри секции и
 * инжектит собственный <style>; index.html и css не трогает.
 *
 * Производительность:
 *  - canvas в 0.5x devicePixelRatio, сим-сетка ещё ~4x мельче,
 *    апскейл с imageSmoothing (на coarse-pointer сетка в 2 раза грубее);
 *  - rAF только пока секция на экране (IntersectionObserver) и
 *    вкладка видима; никаких scroll-слушателей.
 *
 * Передача эстафеты от масляного следа (.cursor-oil-layer):
 * при видимости секции >= 40% слой плавно гасится до opacity 0
 * (CSS transition, выставляется через JS) и восстанавливается
 * при уходе из секции. iridescent-trail.js инлайновую opacity
 * слоя не трогает — конфликтов нет.
 */

const STYLE_ID = 'water-ripple-style';
const CANVAS_CLASS = 'water-ripple-canvas';
const WRAP_CLASS = 'water-ripple-wrap';

// --- Перспективная проекция «пол» ---
const PERSPECTIVE_PX = 850;     // perspective(d): дистанция камеры
const TILT_DEG = 55;            // rotateX: наклон плоскости воды
const TILT_RAD = (TILT_DEG * Math.PI) / 180;
const TILT_SIN = Math.sin(TILT_RAD);
const TILT_COS = Math.cos(TILT_RAD);
const COVERAGE_ROW = 0.94;      // доля высоты источника с гарантией полной ширины
const SCALE_MIN = 1.2;          // пределы авто-scale (страховка на резких вьюпортах)
const SCALE_MAX = 4.2;
const LOOP_PULSE_RISE = 0.34;   // якорь эхо-ряби: доля видимой высоты воды от низа

const DAMPING = 0.985;          // затухание волны
const CANVAS_DPR_SCALE = 0.5;   // canvas в половину devicePixelRatio
const CELL_FINE = 4;            // ячейка сетки (px canvas-буфера), десктоп
const CELL_COARSE = 8;          // на тач-устройствах сетка вдвое грубее
const MAX_CELLS = 60000;        // жёсткий потолок размера сетки
const MIN_STEP_MS = 15;         // не чаще ~60 шагов/с даже на 120Hz

const LIGHT_GAIN = 0.5;         // усиление светотени (чуть выше: ракурс сжимает контраст)
const BODY_GAIN = 0.05;         // мягкое лиловое «тело» волны по |высоте|
const MAX_ALPHA = 0.58;         // потолок непрозрачности — воздушность

// Нежно-лиловая тень (#cbb8dd-семейство, гармонирует с rgba(232,187,255,…))
const LILAC_R = 203;
const LILAC_G = 184;
const LILAC_B = 221;

const AMBIENT_MIN_MS = 2500;    // фоновая капля каждые ~2.5–4s
const AMBIENT_RANGE_MS = 1500;
const LOOP_EVERY_MS = 3400;     // зацикленная рябь у центра-низа
const OIL_FADE_RATIO = 0.4;     // порог видимости секции для гашения следа

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const initWaterRipple = () => {
    if (typeof window === 'undefined') return;

    const section = document.getElementById('contacts')
        || document.querySelector('.contacts-section');
    if (!section) return;
    if (section.querySelector(`.${CANVAS_CLASS}`)) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;

    // --- Стили: инжектим один раз, ничего в css-файлах не меняем ---
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
.${WRAP_CLASS} {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 60%;
  z-index: 1; /* над фоном секции, под .content (z-index: 2) с формой и заголовком */
  pointer-events: none;
  overflow: hidden; /* клипает низ повёрнутой плоскости, растянутый scale-ом */
  /* страховочное растворение у верхней кромки бокса поверх rowFade */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 12%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 12%);
}
.${CANVAS_CLASS} {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: block;
  transform-origin: 50% 100%;
  will-change: transform;
}
`;
        document.head.appendChild(style);
    }

    const wrap = document.createElement('div');
    wrap.className = WRAP_CLASS;
    wrap.setAttribute('aria-hidden', 'true');

    const canvas = document.createElement('canvas');
    canvas.className = CANVAS_CLASS;
    const ctx = canvas.getContext('2d');

    const simCanvas = document.createElement('canvas');
    const simCtx = simCanvas.getContext('2d');
    if (!ctx || !simCtx) return;

    wrap.appendChild(canvas);
    section.appendChild(wrap);

    const state = {
        cssWidth: 0,
        cssHeight: 0,
        gridWidth: 0,
        gridHeight: 0,
        curr: null,
        prev: null,
        rowFade: null,
        colFade: null,
        imageData: null,
        frameId: 0,
        lastStepAt: 0,
        intersecting: false,
        nextAmbientAt: 0,
        nextLoopAt: 0,
        // проекция (пересчитывается в resize)
        projScale: 1,
        projTop: 0,      // видимая высота воды на экране (px от низа бокса)
        loopGX: 0,       // якорь эхо-ряби в сим-координатах
        loopGY: 0,
        // указатель (десктоп-след)
        lastMoveX: 0,
        lastMoveY: 0,
        lastMoveAt: 0,
        hasMove: false,
        // тап на таче (различаем tap и scroll-drag)
        touchStartX: 0,
        touchStartY: 0,
        touchStartAt: 0,
        touchPending: false,
    };

    const isRunning = () => state.intersecting && !document.hidden;

    const resize = () => {
        const cssWidth = section.clientWidth;
        const cssHeight = Math.max(1, Math.round(section.clientHeight * 0.6));
        state.cssWidth = cssWidth;
        state.cssHeight = cssHeight;

        const dpr = Math.min(window.devicePixelRatio || 1, 2) * CANVAS_DPR_SCALE;
        canvas.width = Math.max(1, Math.round(cssWidth * dpr));
        canvas.height = Math.max(1, Math.round(cssHeight * dpr));

        let cell = coarsePointer ? CELL_COARSE : CELL_FINE;
        let gridWidth = Math.max(24, Math.floor(canvas.width / cell));
        let gridHeight = Math.max(16, Math.floor(canvas.height / cell));
        if (gridWidth * gridHeight > MAX_CELLS) {
            const shrink = Math.sqrt((gridWidth * gridHeight) / MAX_CELLS);
            gridWidth = Math.max(24, Math.floor(gridWidth / shrink));
            gridHeight = Math.max(16, Math.floor(gridHeight / shrink));
        }
        state.gridWidth = gridWidth;
        state.gridHeight = gridHeight;

        const size = gridWidth * gridHeight;
        state.curr = new Float32Array(size);
        state.prev = new Float32Array(size);
        state.imageData = simCtx.createImageData(gridWidth, gridHeight);
        simCanvas.width = gridWidth;
        simCanvas.height = gridHeight;

        // Мягкое растворение краёв: верх (дальний край плоскости) — в фон
        // секции; ракурс сжимает верхние строки, поэтому полоса фейда шире
        state.rowFade = new Float32Array(gridHeight);
        for (let y = 0; y < gridHeight; y += 1) {
            const topEdge = clamp(y / (gridHeight * 0.4), 0, 1);
            const bottomEdge = clamp((gridHeight - 1 - y) / (gridHeight * 0.06), 0, 1);
            state.rowFade[y] = (topEdge * topEdge * (3 - (2 * topEdge)))
                * (0.75 + (0.25 * bottomEdge));
        }
        state.colFade = new Float32Array(gridWidth);
        for (let x = 0; x < gridWidth; x += 1) {
            const edge = Math.min(x, gridWidth - 1 - x);
            state.colFade[x] = clamp(edge / (gridWidth * 0.06), 0, 1);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // --- Перспектива: scale подбираем так, чтобы повёрнутая плоскость
        // покрывала секцию по ширине на всех строках с видимой альфой.
        // Условие покрытия строки Y (от низа, вверх отрицательно):
        // s·d / (d − s·Y·sinθ) ≥ 1  →  s ≥ d / (d − |Y|·sinθ).
        const coverDepth = COVERAGE_ROW * cssHeight * TILT_SIN;
        const coverDenom = PERSPECTIVE_PX - coverDepth;
        const scale = coverDenom > PERSPECTIVE_PX / SCALE_MAX
            ? clamp(PERSPECTIVE_PX / coverDenom, SCALE_MIN, SCALE_MAX)
            : SCALE_MAX;
        state.projScale = scale;

        // Видимая высота воды: проекция верхней кромки источника (Y = −H)
        const uTop = -scale * cssHeight;
        state.projTop = (-uTop * TILT_COS * PERSPECTIVE_PX)
            / (PERSPECTIVE_PX - (uTop * TILT_SIN));

        canvas.style.transform = `perspective(${PERSPECTIVE_PX}px)`
            + ` rotateX(${TILT_DEG}deg) scale(${scale.toFixed(4)})`;

        // Якорь эхо-ряби: экранная точка центр-низ видимой воды → сим-сетка
        const anchor = unprojectLocal(
            cssWidth * 0.5,
            cssHeight - (state.projTop * LOOP_PULSE_RISE)
        );
        if (anchor) {
            state.loopGX = (anchor.x / cssWidth) * gridWidth;
            state.loopGY = (anchor.y / cssHeight) * gridHeight;
        } else {
            state.loopGX = gridWidth * 0.5;
            state.loopGY = gridHeight * 0.74;
        }
    };

    // --- Капля: гауссово углубление в поле высот ---
    const dropAt = (gx, gy, radius, strength) => {
        const { gridWidth, gridHeight, curr } = state;
        if (!curr) return;
        const cx = clamp(gx, 1, gridWidth - 2);
        const cy = clamp(gy, 1, gridHeight - 2);
        const minX = Math.max(1, Math.floor(cx - radius));
        const maxX = Math.min(gridWidth - 2, Math.ceil(cx + radius));
        const minY = Math.max(1, Math.floor(cy - radius));
        const maxY = Math.min(gridHeight - 2, Math.ceil(cy + radius));
        const r2 = radius * radius;

        for (let y = minY; y <= maxY; y += 1) {
            for (let x = minX; x <= maxX; x += 1) {
                const dx = x - cx;
                const dy = y - cy;
                const d2 = (dx * dx) + (dy * dy);
                if (d2 > r2) continue;
                curr[(y * gridWidth) + x] -= strength * Math.exp(-d2 / (r2 * 0.55));
            }
        }
    };

    // --- Обратная проекция: экранная точка бокса → точка на плоскости воды.
    // Прямое отображение (origin — нижний центр, Y вверх отрицателен):
    //   u = s·Y;  x' = X·s·d / (d − u·sinθ);  y' = u·cosθ·d / (d − u·sinθ).
    // Обратно из y': u = d·Y' / (d·cosθ + Y'·sinθ), затем
    //   X = X'·(d − u·sinθ) / (s·d),  Y = u / s.
    // Возвращает точку в css-координатах бокса или null (выше горизонта).
    const unprojectLocal = (xLocal, yLocal) => {
        const { cssWidth, cssHeight, projScale } = state;
        const Xp = xLocal - (cssWidth * 0.5);
        const Yp = yLocal - cssHeight;
        const denom = (PERSPECTIVE_PX * TILT_COS) + (Yp * TILT_SIN);
        if (denom < PERSPECTIVE_PX * 0.02) return null; // у/выше горизонта
        const u = (PERSPECTIVE_PX * Yp) / denom;
        const depth = PERSPECTIVE_PX - (u * TILT_SIN);
        return {
            x: ((Xp * depth) / (projScale * PERSPECTIVE_PX)) + (cssWidth * 0.5),
            y: (u / projScale) + cssHeight,
        };
    };

    const dropAtClient = (clientX, clientY, radius, strength) => {
        const rect = wrap.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        // клиент → css-координаты бокса (rect не искажён: wrap без transform)
        const point = unprojectLocal(
            ((clientX - rect.left) / rect.width) * state.cssWidth,
            ((clientY - rect.top) / rect.height) * state.cssHeight
        );
        if (!point) return false;
        const gx = (point.x / state.cssWidth) * state.gridWidth;
        const gy = (point.y / state.cssHeight) * state.gridHeight;
        if (gx < 0 || gx > state.gridWidth || gy < 0 || gy > state.gridHeight) return false;
        dropAt(gx, gy, radius, strength);
        return true;
    };

    const ensureFrame = () => {
        if (!state.frameId && isRunning()) {
            state.frameId = window.requestAnimationFrame(frame);
        }
    };

    // --- Шаг симуляции: усреднение 4 соседей минус прошлое, затухание ---
    const step = () => {
        const { curr, prev, gridWidth, gridHeight } = state;
        for (let y = 1; y < gridHeight - 1; y += 1) {
            let index = (y * gridWidth) + 1;
            for (let x = 1; x < gridWidth - 1; x += 1, index += 1) {
                prev[index] = (
                    ((curr[index - 1] + curr[index + 1]
                        + curr[index - gridWidth] + curr[index + gridWidth]) * 0.5)
                    - prev[index]
                ) * DAMPING;
            }
        }
        const swap = state.curr;
        state.curr = state.prev;
        state.prev = swap;
    };

    // --- Рендер: свет сверху-слева, гребни белеют, впадины — лиловая тень ---
    const render = () => {
        const { curr, gridWidth, gridHeight, rowFade, colFade } = state;
        const data = state.imageData.data;
        let energy = 0;

        for (let y = 0; y < gridHeight; y += 1) {
            const fy = rowFade[y];
            const rowIndex = y * gridWidth;
            const upOffset = y > 0 ? -gridWidth : 0;
            const downOffset = y < gridHeight - 1 ? gridWidth : 0;

            for (let x = 0; x < gridWidth; x += 1) {
                const index = rowIndex + x;
                const px = index * 4;
                const height = curr[index];
                const absHeight = Math.abs(height);
                if (absHeight > energy) energy = absHeight;

                const left = x > 0 ? curr[index - 1] : height;
                const right = x < gridWidth - 1 ? curr[index + 1] : height;
                const top = curr[index + upOffset];
                const bottom = curr[index + downOffset];
                const light = ((left - right) + (top - bottom)) * LIGHT_GAIN;

                const fade = fy * colFade[x];
                const white = (light > 0 ? light * 0.85 : 0) * fade;
                const lilac = ((light < 0 ? -light : 0) + (absHeight * BODY_GAIN)) * fade;
                const total = white + lilac;

                if (total < 0.012) {
                    data[px + 3] = 0;
                    continue;
                }

                const t = lilac / total; // доля лиловой тени в пикселе
                data[px] = 255 + ((LILAC_R - 255) * t);
                data[px + 1] = 255 + ((LILAC_G - 255) * t);
                data[px + 2] = 255 + ((LILAC_B - 255) * t);
                data[px + 3] = Math.round(clamp(total, 0, MAX_ALPHA) * 255);
            }
        }

        simCtx.putImageData(state.imageData, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(simCanvas, 0, 0, canvas.width, canvas.height);

        return energy;
    };

    const scheduleAmbient = (now) => {
        state.nextAmbientAt = now + AMBIENT_MIN_MS + (Math.random() * AMBIENT_RANGE_MS);
    };

    const frame = (timestamp) => {
        state.frameId = 0;
        if (!isRunning()) return;

        if (timestamp - state.lastStepAt < MIN_STEP_MS) {
            // 120Hz-экраны: не ускоряем волну, просто ждём следующий кадр
            state.frameId = window.requestAnimationFrame(frame);
            return;
        }
        state.lastStepAt = timestamp;

        // Идле-жизнь: случайные капли + зацикленная рябь у центра-низа.
        // При prefers-reduced-motion фоновой жизни нет — только отклик на ввод.
        if (!reducedMotion) {
            if (timestamp >= state.nextAmbientAt) {
                dropAt(
                    (0.08 + (Math.random() * 0.84)) * state.gridWidth,
                    (0.15 + (Math.random() * 0.7)) * state.gridHeight,
                    2.4,
                    0.85
                );
                scheduleAmbient(timestamp);
            }
            if (timestamp >= state.nextLoopAt) {
                // эхо статичной ряби: якорь считается в resize так, чтобы
                // В ПРОЕКЦИИ эллипс сидел по центру-низу видимой воды
                dropAt(state.loopGX, state.loopGY, 3.1, 0.8);
                state.nextLoopAt = timestamp + LOOP_EVERY_MS;
            }
        }

        step();
        const energy = render();

        // Без reduced-motion фоновые капли держат поверхность живой всё время,
        // пока секция на экране; с reduced-motion спим, когда волны затихли.
        if (!reducedMotion || energy > 0.01) {
            state.frameId = window.requestAnimationFrame(frame);
        }
    };

    // --- Ввод. Все слушатели passive, скроллу не мешаем. ---
    const strengthFactor = reducedMotion ? 0.45 : 1;

    const onPointerMove = (event) => {
        if (!finePointer || event.pointerType === 'touch') return;

        const now = performance.now();
        if (!state.hasMove) {
            state.hasMove = true;
            state.lastMoveX = event.clientX;
            state.lastMoveY = event.clientY;
            state.lastMoveAt = now;
            return;
        }

        const dx = event.clientX - state.lastMoveX;
        const dy = event.clientY - state.lastMoveY;
        const dist = Math.hypot(dx, dy);
        const dt = now - state.lastMoveAt;
        if (dist < 10 && dt < 40) return; // троттлинг следа

        const speed = dist / Math.max(dt, 8); // px/ms
        const strength = clamp(0.16 + (speed * 0.32), 0.16, 0.85) * strengthFactor;
        if (dropAtClient(event.clientX, event.clientY, 2, strength)) {
            ensureFrame();
        }
        state.lastMoveX = event.clientX;
        state.lastMoveY = event.clientY;
        state.lastMoveAt = now;
    };

    const onPointerDown = (event) => {
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
            // тач: капля только на тап, не на scroll-drag — решаем на pointerup
            state.touchPending = true;
            state.touchStartX = event.clientX;
            state.touchStartY = event.clientY;
            state.touchStartAt = performance.now();
            return;
        }
        // десктоп: клик = крупная капля
        if (dropAtClient(event.clientX, event.clientY, 3.4, 2.1 * strengthFactor)) {
            ensureFrame();
        }
    };

    const onPointerUp = (event) => {
        if (!state.touchPending) return;
        state.touchPending = false;
        const dt = performance.now() - state.touchStartAt;
        const dist = Math.hypot(
            event.clientX - state.touchStartX,
            event.clientY - state.touchStartY
        );
        if (dt > 350 || dist > 12) return; // это был скролл или долгое удержание
        if (dropAtClient(event.clientX, event.clientY, 3, 1.7 * strengthFactor)) {
            ensureFrame();
        }
    };

    const onPointerCancel = () => {
        state.touchPending = false;
    };

    // При выходе курсора из секции сбрасываем траекторию, иначе первый drop
    // после возврата получает завышенную силу из устаревших координат
    const onPointerLeave = () => {
        state.hasMove = false;
        state.touchPending = false;
    };

    section.addEventListener('pointermove', onPointerMove, { passive: true });
    section.addEventListener('pointerdown', onPointerDown, { passive: true });
    section.addEventListener('pointerup', onPointerUp, { passive: true });
    section.addEventListener('pointercancel', onPointerCancel, { passive: true });
    section.addEventListener('pointerleave', onPointerLeave, { passive: true });

    // --- Видимость секции: запуск/останов rAF + гашение масляного следа ---
    const setOilLayerFaded = (faded) => {
        const oilLayer = document.querySelector('.cursor-oil-layer');
        if (!oilLayer) return;
        if (!oilLayer.style.transition) {
            oilLayer.style.transition = 'opacity 1.1s ease';
        }
        // '' возвращает управление css-правилу (opacity: 1 в layout.css)
        oilLayer.style.opacity = faded ? '0' : '';
    };

    const observer = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        state.intersecting = entry.isIntersecting;

        if (isRunning()) {
            // Страховка: при инициализации до завершения layout размеры могли
            // быть неверными — перемеряем при входе секции в вьюпорт
            const nextWidth = section.clientWidth;
            const nextHeight = Math.max(1, Math.round(section.clientHeight * 0.6));
            if (nextWidth !== state.cssWidth || nextHeight !== state.cssHeight) {
                resize();
            }

            const now = performance.now();
            state.lastStepAt = 0;
            if (!state.nextAmbientAt || state.nextAmbientAt < now) {
                scheduleAmbient(now - AMBIENT_MIN_MS + 600); // первая капля почти сразу
            }
            if (!state.nextLoopAt || state.nextLoopAt < now) {
                state.nextLoopAt = now + 900;
            }
            ensureFrame();
        } else if (state.frameId) {
            window.cancelAnimationFrame(state.frameId);
            state.frameId = 0;
        }

        // Эстафета от жидкостного следа: >= 40% секции видно — след растворяется
        setOilLayerFaded(entry.isIntersecting && entry.intersectionRatio >= OIL_FADE_RATIO);
    }, { threshold: [0, 0.2, OIL_FADE_RATIO, 0.6, 0.8] });

    observer.observe(section);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (state.frameId) {
                window.cancelAnimationFrame(state.frameId);
                state.frameId = 0;
            }
            return;
        }
        state.lastStepAt = 0;
        ensureFrame();
    });

    // Ресайз с дебаунсом: мобильный url-bar дёргает resize при скролле,
    // пересобираем буферы только при реальном изменении размеров
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            const nextWidth = section.clientWidth;
            const nextHeight = Math.max(1, Math.round(section.clientHeight * 0.6));
            if (nextWidth === state.cssWidth && nextHeight === state.cssHeight) return;
            resize();
            ensureFrame();
        }, 180);
    }, { passive: true });

    resize();
};
