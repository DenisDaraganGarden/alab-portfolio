const MOBILE_BREAKPOINT = 900;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, alpha) => from + ((to - from) * alpha);
const smoothstep = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - (2 * t));
};

const allocateField = (size) => new Float32Array(size);

export const initIridescentTrail = () => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.querySelector('.cursor-oil-layer')) return;

    const smoothWrapper = document.getElementById('smooth-wrapper');
    const layer = document.createElement('div');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const simCanvas = document.createElement('canvas');
    const simContext = simCanvas.getContext('2d', { willReadFrequently: true });

    if (!context || !simContext) return;

    layer.className = 'cursor-oil-layer';
    layer.setAttribute('aria-hidden', 'true');

    canvas.className = 'cursor-oil-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    layer.appendChild(canvas);

    document.body.insertBefore(layer, smoothWrapper ?? document.body.firstChild);

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);

    const pointer = {
        x: window.innerWidth * 0.5,
        y: window.innerHeight * 0.5,
        vx: 0,
        vy: 0,
        down: false,
        started: false,
        lastTime: performance.now(),
        lastMoveAt: 0,
    };

    const scroll = {
        y: window.scrollY,
        velocity: 0,
        drift: 0,
        lastTime: performance.now(),
        lastActiveAt: 0,
    };

    const state = {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        frameId: 0,
        lastFrameAt: performance.now(),
        cellSize: mediaQuery.matches ? 12 : 10,
        gridWidth: 0,
        gridHeight: 0,
        imageData: null,
        mass: null,
        warm: null,
        cool: null,
        violet: null,
        vx: null,
        vy: null,
        nextMass: null,
        nextWarm: null,
        nextCool: null,
        nextViolet: null,
        nextVx: null,
        nextVy: null,
        blur: null,
    };

    const indexFor = (x, y) => x + (y * state.gridWidth);

    const sampleField = (field, x, y) => {
        const maxX = state.gridWidth - 1;
        const maxY = state.gridHeight - 1;
        const px = clamp(x, 0, maxX);
        const py = clamp(y, 0, maxY);
        const x0 = Math.floor(px);
        const y0 = Math.floor(py);
        const x1 = Math.min(maxX, x0 + 1);
        const y1 = Math.min(maxY, y0 + 1);
        const tx = px - x0;
        const ty = py - y0;

        const top = lerp(field[indexFor(x0, y0)], field[indexFor(x1, y0)], tx);
        const bottom = lerp(field[indexFor(x0, y1)], field[indexFor(x1, y1)], tx);
        return lerp(top, bottom, ty);
    };

    const blurField = (source, target, carry = 0) => {
        for (let y = 0; y < state.gridHeight; y += 1) {
            const yPrev = Math.max(0, y - 1);
            const yNext = Math.min(state.gridHeight - 1, y + 1);

            for (let x = 0; x < state.gridWidth; x += 1) {
                const xPrev = Math.max(0, x - 1);
                const xNext = Math.min(state.gridWidth - 1, x + 1);
                const index = indexFor(x, y);

                const average = (
                    source[index] * 0.42
                    + source[indexFor(xPrev, y)] * 0.14
                    + source[indexFor(xNext, y)] * 0.14
                    + source[indexFor(x, yPrev)] * 0.14
                    + source[indexFor(x, yNext)] * 0.14
                    + source[indexFor(xPrev, yPrev)] * 0.005
                    + source[indexFor(xNext, yPrev)] * 0.005
                    + source[indexFor(xPrev, yNext)] * 0.005
                    + source[indexFor(xNext, yNext)] * 0.005
                );

                target[index] = lerp(source[index], average, carry);
            }
        }
    };

    const advectScalar = (source, target, dissipation, dtScale) => {
        for (let y = 0; y < state.gridHeight; y += 1) {
            for (let x = 0; x < state.gridWidth; x += 1) {
                const index = indexFor(x, y);
                const px = x - (state.vx[index] * dtScale);
                const py = y - (state.vy[index] * dtScale);
                target[index] = sampleField(source, px, py) * dissipation;
            }
        }
    };

    const advectVelocity = (dtScale) => {
        for (let y = 0; y < state.gridHeight; y += 1) {
            for (let x = 0; x < state.gridWidth; x += 1) {
                const index = indexFor(x, y);
                const px = x - (state.vx[index] * dtScale);
                const py = y - (state.vy[index] * dtScale);

                state.nextVx[index] = sampleField(state.vx, px, py) * 0.984;
                state.nextVy[index] = sampleField(state.vy, px, py) * 0.984;
            }
        }
    };

    const swapFields = (sourceName, nextName) => {
        const temp = state[sourceName];
        state[sourceName] = state[nextName];
        state[nextName] = temp;
    };

    const resizeSimulation = () => {
        state.width = window.innerWidth;
        state.height = window.innerHeight;
        state.dpr = Math.min(window.devicePixelRatio || 1, 2);
        state.cellSize = mediaQuery.matches ? 14 : 11;
        state.gridWidth = Math.max(72, Math.ceil(state.width / state.cellSize));
        state.gridHeight = Math.max(48, Math.ceil(state.height / state.cellSize));

        canvas.width = Math.round(state.width * state.dpr);
        canvas.height = Math.round(state.height * state.dpr);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.scale(state.dpr, state.dpr);
        context.imageSmoothingEnabled = true;

        simCanvas.width = state.gridWidth;
        simCanvas.height = state.gridHeight;
        simContext.imageSmoothingEnabled = true;
        state.imageData = simContext.createImageData(state.gridWidth, state.gridHeight);

        const size = state.gridWidth * state.gridHeight;
        state.mass = allocateField(size);
        state.warm = allocateField(size);
        state.cool = allocateField(size);
        state.violet = allocateField(size);
        state.vx = allocateField(size);
        state.vy = allocateField(size);
        state.nextMass = allocateField(size);
        state.nextWarm = allocateField(size);
        state.nextCool = allocateField(size);
        state.nextViolet = allocateField(size);
        state.nextVx = allocateField(size);
        state.nextVy = allocateField(size);
        state.blur = allocateField(size);
    };

    const ensureFrame = () => {
        if (!state.frameId) {
            state.frameId = window.requestAnimationFrame(renderFrame);
        }
    };

    const injectAt = (x, y, vx, vy, pressure) => {
        const gx = (x / state.width) * state.gridWidth;
        const gy = (y / state.height) * state.gridHeight;
        const speed = Math.hypot(vx, vy);
        const radius = mediaQuery.matches
            ? (4.6 + (pressure * 2.3) + Math.min(2.4, speed * 0.05))
            : (5.2 + (pressure * 2.8) + Math.min(3.1, speed * 0.05));
        const minX = Math.max(0, Math.floor(gx - radius - 1));
        const maxX = Math.min(state.gridWidth - 1, Math.ceil(gx + radius + 1));
        const minY = Math.max(0, Math.floor(gy - radius - 1));
        const maxY = Math.min(state.gridHeight - 1, Math.ceil(gy + radius + 1));
        const norm = Math.hypot(vx, vy) || 1;
        const dirX = vx / norm;
        const dirY = vy / norm;

        for (let gridY = minY; gridY <= maxY; gridY += 1) {
            for (let gridX = minX; gridX <= maxX; gridX += 1) {
                const dx = gridX - gx;
                const dy = gridY - gy;
                const distance = Math.hypot(dx, dy);
                if (distance > radius) continue;

                const falloff = Math.exp(-((distance * distance) / (radius * radius * 0.82)));
                const index = indexFor(gridX, gridY);
                const side = clamp((dx * dirY) - (dy * dirX), -1, 1);
                const tangentX = -dy / (distance || 1);
                const tangentY = dx / (distance || 1);
                const injectSpeed = 0.0028 + Math.min(0.016, speed * 0.00011);
                const swirl = falloff * (0.008 + (pressure * 0.006));

                state.vx[index] += (vx * injectSpeed * falloff) + (tangentX * swirl);
                state.vy[index] += (vy * injectSpeed * falloff) + (tangentY * swirl);
                state.mass[index] += falloff * (0.072 + (pressure * 0.052));
                state.warm[index] += falloff * (0.012 + (Math.max(0, side) * 0.054));
                state.cool[index] += falloff * (0.012 + (Math.max(0, -side) * 0.056));
                state.violet[index] += falloff * (0.006 + (pressure * 0.012));
            }
        }
    };

    const stampTrail = (fromX, fromY, toX, toY, vx, vy, pressure) => {
        const distance = Math.hypot(toX - fromX, toY - fromY);
        const step = mediaQuery.matches ? 18 : 14;
        const steps = Math.max(1, Math.ceil(distance / step));

        for (let index = 1; index <= steps; index += 1) {
            const alpha = index / steps;
            injectAt(
                lerp(fromX, toX, alpha),
                lerp(fromY, toY, alpha),
                vx,
                vy,
                pressure
            );
        }
    };

    const injectScrollWake = (velocity) => {
        const strength = clamp(Math.abs(velocity), 0, mediaQuery.matches ? 24 : 28);
        if (strength < 1.2) return;

        const direction = Math.sign(velocity) || 1;
        const anchorX = pointer.started ? pointer.x : state.width * 0.68;
        const anchorYBase = pointer.started ? pointer.y : state.height * 0.44;
        const anchorY = clamp(anchorYBase + (direction * (mediaQuery.matches ? 24 : 28)), 0, state.height);
        const lateralSpread = mediaQuery.matches ? 42 : 56;
        const wakePressure = 0.08 + Math.min(0.16, strength * 0.006);
        const wakeVy = velocity * 0.58;
        const wakeVx = pointer.vx * 0.08;

        injectAt(anchorX, anchorY, wakeVx, wakeVy, wakePressure);
        injectAt(anchorX - lateralSpread, anchorY, wakeVx * 0.82, wakeVy * 0.92, wakePressure * 0.78);
        injectAt(anchorX + lateralSpread, anchorY, wakeVx * 0.82, wakeVy * 0.92, wakePressure * 0.78);
    };

    const updatePointer = (event) => {
        if (event.isPrimary === false) return;

        const now = performance.now();
        const x = event.clientX;
        const y = event.clientY;

        if (!pointer.started) {
            pointer.started = true;
            pointer.x = x;
            pointer.y = y;
            pointer.lastTime = now;
            pointer.lastMoveAt = now;
        }

        const dt = Math.max(14, now - pointer.lastTime);
        const nextVx = ((x - pointer.x) / dt) * 16;
        const nextVy = ((y - pointer.y) / dt) * 16;
        const pressure = event.pressure || (pointer.down ? 0.88 : 0.36);

        stampTrail(pointer.x, pointer.y, x, y, nextVx, nextVy, pressure);

        pointer.vx = lerp(pointer.vx, nextVx, 0.24);
        pointer.vy = lerp(pointer.vy, nextVy, 0.24);
        pointer.x = x;
        pointer.y = y;
        pointer.lastTime = now;
        pointer.lastMoveAt = now;

        ensureFrame();
    };

    const onPointerDown = (event) => {
        pointer.down = true;
        updatePointer(event);
        injectAt(
            event.clientX,
            event.clientY,
            pointer.vx * 1.4,
            pointer.vy * 1.4,
            Math.max(0.96, event.pressure || 0.94)
        );
        ensureFrame();
    };

    const onPointerUp = () => {
        pointer.down = false;
        pointer.lastMoveAt = performance.now();
        ensureFrame();
    };

    const onScroll = () => {
        const now = performance.now();
        const currentY = window.scrollY;
        const deltaY = currentY - scroll.y;
        const dt = Math.max(16, now - scroll.lastTime);

        if (Math.abs(deltaY) < 0.5) return;

        const nextVelocity = clamp((deltaY / dt) * 16, mediaQuery.matches ? -28 : -32, mediaQuery.matches ? 28 : 32);

        scroll.velocity = lerp(scroll.velocity, nextVelocity, 0.34);
        scroll.y = currentY;
        scroll.lastTime = now;
        scroll.lastActiveAt = now;

        injectScrollWake(scroll.velocity);
        ensureFrame();
    };

    const renderField = (timestamp) => {
        const data = state.imageData.data;

        for (let y = 0; y < state.gridHeight; y += 1) {
            const yPrev = Math.max(0, y - 1);
            const yNext = Math.min(state.gridHeight - 1, y + 1);

            for (let x = 0; x < state.gridWidth; x += 1) {
                const xPrev = Math.max(0, x - 1);
                const xNext = Math.min(state.gridWidth - 1, x + 1);
                const index = indexFor(x, y);
                const px = index * 4;
                const density = state.mass[index];
                const warm = state.warm[index];
                const cool = state.cool[index];
                const violet = state.violet[index];

                if (density < 0.006 && warm < 0.004 && cool < 0.004 && violet < 0.004) {
                    data[px] = 0;
                    data[px + 1] = 0;
                    data[px + 2] = 0;
                    data[px + 3] = 0;
                    continue;
                }

                const edgeX = state.mass[indexFor(xNext, y)] - state.mass[indexFor(xPrev, y)];
                const edgeY = state.mass[indexFor(x, yNext)] - state.mass[indexFor(x, yPrev)];
                const edge = clamp(Math.hypot(edgeX, edgeY) * 5.8, 0, 1);
                const body = smoothstep(0.01, 0.32, density);
                const pearl = clamp(violet * 2.1, 0, 1);
                const warmTone = clamp(warm * 3.8, 0, 1);
                const coolTone = clamp(cool * 4.1, 0, 1);
                const milk = clamp((body * 0.62) + (edge * 0.42), 0, 1);
                const base = 236 - (body * 34) - (milk * 12);

                const red = clamp(base + (warmTone * 42) + (edge * 10), 0, 255);
                const green = clamp((base - 4) + (warmTone * 8) + (coolTone * 5), 0, 255);
                const blue = clamp((base + 8) + (coolTone * 56) + (pearl * 20), 0, 255);
                const alpha = clamp((body * 0.54) + (edge * 0.34) + (milk * 0.12), 0, 1);

                data[px] = red;
                data[px + 1] = green;
                data[px + 2] = blue;
                data[px + 3] = Math.round(alpha * 255);
            }
        }

        simContext.putImageData(state.imageData, 0, 0);

        context.clearRect(0, 0, state.width, state.height);

        context.save();
        context.globalAlpha = 0.82;
        context.filter = `blur(${mediaQuery.matches ? 24 : 28}px) saturate(118%)`;
        context.drawImage(simCanvas, 0, 0, state.width, state.height);
        context.restore();

        context.save();
        context.globalAlpha = 0.54;
        context.filter = `blur(${mediaQuery.matches ? 12 : 14}px) saturate(132%)`;
        context.drawImage(simCanvas, 0, 0, state.width, state.height);
        context.restore();

        context.save();
        context.globalAlpha = 0.14;
        context.filter = `blur(${mediaQuery.matches ? 5 : 6}px) saturate(124%)`;
        context.drawImage(simCanvas, 0, 0, state.width, state.height);
        context.restore();

        const idle = clamp(1 - ((timestamp - pointer.lastMoveAt) / 1800), 0, 1);
        if (idle > 0.01) {
            const speed = Math.hypot(pointer.vx, pointer.vy);
            const radius = (mediaQuery.matches ? 110 : 126) + (speed * 0.55);
            const angle = Math.atan2(pointer.vy || 0.001, pointer.vx || 0.001);
            const glowX = pointer.x + (Math.cos(angle) * radius * 0.1);
            const glowY = pointer.y + (Math.sin(angle) * radius * 0.1);

            context.save();
            context.globalAlpha = idle * 0.42;
            context.filter = `blur(${mediaQuery.matches ? 22 : 28}px)`;
            const glow = context.createRadialGradient(glowX, glowY, radius * 0.06, glowX, glowY, radius);
            glow.addColorStop(0, 'rgba(255,255,255,0.44)');
            glow.addColorStop(0.38, 'rgba(255,221,204,0.18)');
            glow.addColorStop(0.7, 'rgba(198,216,255,0.16)');
            glow.addColorStop(1, 'rgba(245,245,247,0)');
            context.fillStyle = glow;
            context.beginPath();
            context.ellipse(glowX, glowY, radius, radius * 0.68, angle, 0, Math.PI * 2);
            context.fill();
            context.restore();
        }
    };

    const stepSimulation = (delta) => {
        const dtScale = Math.min(1.25, delta / 16) * 0.82;
        const sinceScroll = performance.now() - scroll.lastActiveAt;
        const scrollActivity = clamp(1 - (sinceScroll / 520), 0, 1);

        scroll.velocity *= scrollActivity > 0 ? 0.94 : 0.88;
        scroll.drift = lerp(scroll.drift, scroll.velocity, scrollActivity > 0 ? 0.12 : 0.06);

        if (Math.abs(scroll.drift) > 0.18) {
            const globalDrift = clamp(scroll.drift * 0.0013, -0.024, 0.024);
            const sideways = clamp(scroll.drift * 0.00022, -0.005, 0.005);

            for (let y = 0; y < state.gridHeight; y += 1) {
                const wave = Math.sin((y / Math.max(1, state.gridHeight - 1)) * Math.PI);

                for (let x = 0; x < state.gridWidth; x += 1) {
                    const index = indexFor(x, y);
                    const density = state.mass[index];
                    if (density < 0.003) continue;

                    const densityGain = 0.34 + Math.min(0.9, density * 2.2);
                    state.vy[index] += globalDrift * densityGain;
                    state.vx[index] += sideways * wave * densityGain;
                }
            }
        }

        advectVelocity(dtScale);
        swapFields('vx', 'nextVx');
        swapFields('vy', 'nextVy');

        blurField(state.vx, state.nextVx, 0.34);
        blurField(state.vy, state.nextVy, 0.34);
        swapFields('vx', 'nextVx');
        swapFields('vy', 'nextVy');

        advectScalar(state.mass, state.nextMass, 0.986, dtScale);
        advectScalar(state.warm, state.nextWarm, 0.982, dtScale);
        advectScalar(state.cool, state.nextCool, 0.982, dtScale);
        advectScalar(state.violet, state.nextViolet, 0.98, dtScale);
        swapFields('mass', 'nextMass');
        swapFields('warm', 'nextWarm');
        swapFields('cool', 'nextCool');
        swapFields('violet', 'nextViolet');

        blurField(state.mass, state.blur, 0.24);
        swapFields('mass', 'blur');
        blurField(state.warm, state.blur, 0.26);
        swapFields('warm', 'blur');
        blurField(state.cool, state.blur, 0.26);
        swapFields('cool', 'blur');
        blurField(state.violet, state.blur, 0.28);
        swapFields('violet', 'blur');
    };

    const renderFrame = (timestamp) => {
        state.frameId = 0;
        const delta = Math.min(34, timestamp - state.lastFrameAt || 16);
        state.lastFrameAt = timestamp;

        stepSimulation(delta);
        renderField(timestamp);

        const idle = clamp(1 - ((timestamp - pointer.lastMoveAt) / 1800), 0, 1);
        const scrollIdle = clamp(1 - ((timestamp - scroll.lastActiveAt) / 700), 0, 1);
        if (idle > 0.01 || pointer.down) {
            injectAt(
                pointer.x,
                pointer.y,
                pointer.vx * 0.7,
                pointer.vy * 0.7,
                pointer.down ? 0.72 : 0.22
            );
        }

        if (scrollIdle > 0.01) {
            injectScrollWake(scroll.drift * 0.38);
        }

        if (pointer.down || idle > 0.02 || scrollIdle > 0.02) {
            ensureFrame();
            return;
        }

        const hasEnergy = state.mass.some((value) => value > 0.006)
            || state.warm.some((value) => value > 0.004)
            || state.cool.some((value) => value > 0.004);

        if (hasEnergy) {
            ensureFrame();
        }
    };

    resizeSimulation();

    window.addEventListener('resize', resizeSimulation, { passive: true });
    mediaQuery.addEventListener?.('change', resizeSimulation);
    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (state.frameId) {
                window.cancelAnimationFrame(state.frameId);
                state.frameId = 0;
            }
            return;
        }

        state.lastFrameAt = performance.now();
        ensureFrame();
    });
};
