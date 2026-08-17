import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getCases, saveCases, recordAnalyticsEvent, getAnalyticsSummary, backupDb } from './db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const IMAGES_DIR = path.join(ROOT_DIR, 'public', 'images');
const AUDIO_DIR = path.join(ROOT_DIR, 'public', 'audio');
const CASES_JSON_PATH = path.join(ROOT_DIR, 'public', 'data', 'cases.json');
const SETTINGS_JSON_PATH = path.join(ROOT_DIR, 'public', 'data', 'settings.json');
const CMS_BASE_PATH = (process.env.CMS_BASE_PATH || '/cms-3001').replace(/\/+$/, '');

// Ensure audio dir exists
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const app = express();
// Любой локальный источник, независимо от порта. Раньше здесь был список из
// четырёх адресов с намертво зашитым 5173, и стоило дев-серверу занять другой
// порт — браузер отклонял запросы с сайта в CMS. Порт у Vite не постоянный:
// он уступает его любому другому проекту, который запустился раньше.
//
// На безопасность это не влияет: сервер слушает только 127.0.0.1, а публичный
// сайт не может выдать себя за источник localhost — такой Origin браузер
// проставляет лишь страницам, которые сами открыты с локального адреса.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

app.use(cors({
    origin: (origin, callback) => {
        // Requests without Origin (curl, same-origin navigation) are allowed;
        // browsers with a foreign Origin get no CORS headers.
        if (!origin || LOCAL_ORIGIN.test(origin)) return callback(null, true);
        callback(null, false);
    }
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'text/plain', limit: '64kb' }));

// Allow the editor to live under a memorable protected prefix, e.g. /cms-3001/.
app.use((req, res, next) => {
    if (!CMS_BASE_PATH) return next();

    const queryIndex = req.url.indexOf('?');
    const pathname = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
    const query = queryIndex === -1 ? '' : req.url.slice(queryIndex);

    if (pathname === CMS_BASE_PATH || pathname.startsWith(`${CMS_BASE_PATH}/`)) {
        const stripped = pathname.slice(CMS_BASE_PATH.length) || '/';
        req.url = `${stripped}${query}`;
    }

    next();
});

// Static files — no auth (login page needs to load)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(ROOT_DIR, 'public', 'images')));
app.use('/audio', express.static(AUDIO_DIR));
// Боевой код сайта для предпросмотра: тот же модуль рендера блоков и те же
// стили, что и на alabspace.com. Раньше предпросмотр рисовал собственную
// вёрстку с инлайн-стилями и показывал не то, что окажется на сайте.
app.use('/site-js', express.static(path.join(ROOT_DIR, 'js')));
app.use('/site-css', express.static(path.join(ROOT_DIR, 'css')));

// ─── Auth (fail-closed, timing-safe, rate-limited) ───
const authConfigured = () => Boolean(process.env.CMS_LOGIN && process.env.CMS_PASSWORD);

// Вход без пароля для работы на своём компьютере: CMS_SKIP_AUTH=1 в .env.
// Сервер слушает только 127.0.0.1 и снаружи не виден; флаг лишь убирает
// экран логина. Чужой доступ к этой машине и так означает доступ к .env.
const AUTH_SKIPPED = process.env.CMS_SKIP_AUTH === '1';

function sha256Buf(value) {
    return crypto.createHash('sha256').update(String(value ?? '')).digest();
}

function safeEqual(a, b) {
    return crypto.timingSafeEqual(sha256Buf(a), sha256Buf(b));
}

function credentialsValid(login, password) {
    const loginOk = safeEqual(login, process.env.CMS_LOGIN);
    const passwordOk = safeEqual(password, process.env.CMS_PASSWORD);
    return loginOk && passwordOk;
}

// In-memory rate limit: max 10 failed auth attempts per IP per 15 minutes
const AUTH_FAIL_WINDOW_MS = 15 * 60 * 1000;
const AUTH_FAIL_MAX = 10;
const authFailures = new Map(); // ip -> [timestamps]

function authIp(req) {
    return req.socket?.remoteAddress || '';
}

function authRateLimited(ip) {
    const now = Date.now();
    const fresh = (authFailures.get(ip) || []).filter(ts => now - ts < AUTH_FAIL_WINDOW_MS);
    if (fresh.length) authFailures.set(ip, fresh); else authFailures.delete(ip);
    return fresh.length >= AUTH_FAIL_MAX;
}

const failedTokens = new Map(); // sha256(token) -> last failure ts (dedupe repeated stale tokens)

function recordAuthFailure(ip, tokenKey = null) {
    const now = Date.now();
    if (tokenKey) {
        for (const [key, ts] of failedTokens) {
            if (now - ts >= AUTH_FAIL_WINDOW_MS) failedTokens.delete(key);
        }
        // The same stale token (e.g. a parallel bulk upload after a password change)
        // counts as one failure, not one per request.
        if (failedTokens.has(tokenKey)) return;
        failedTokens.set(tokenKey, now);
    }
    const list = authFailures.get(ip) || [];
    list.push(now);
    authFailures.set(ip, list);
}

// Auth middleware — only for /api routes
const apiAuth = (req, res, next) => {
    if (AUTH_SKIPPED) return next();
    if (!authConfigured()) return res.status(503).json({ error: 'CMS_LOGIN/CMS_PASSWORD не заданы в .env' });
    const ip = authIp(req);
    const token = req.headers['x-cms-token'];
    // Valid credentials are checked BEFORE the limiter: the real owner must
    // always be able to get back in even after a burst of stale-token failures.
    if (token) {
        try {
            const decoded = Buffer.from(String(token), 'base64').toString();
            const separator = decoded.indexOf(':');
            const login = separator === -1 ? decoded : decoded.slice(0, separator);
            const password = separator === -1 ? '' : decoded.slice(separator + 1);
            if (credentialsValid(login, password)) {
                authFailures.delete(ip);
                return next();
            }
        } catch(e) {}
    }
    if (authRateLimited(ip)) return res.status(429).json({ error: 'Слишком много неудачных попыток входа. Попробуйте через 15 минут.' });
    if (!token) return res.status(401).json({ error: 'No token' });
    recordAuthFailure(ip, sha256Buf(token).toString('hex'));
    res.status(401).json({ error: 'Invalid credentials' });
};

// Auth check endpoint
app.post('/api/login', (req, res) => {
    if (!authConfigured()) return res.status(503).json({ error: 'CMS_LOGIN/CMS_PASSWORD не заданы в .env' });
    const ip = authIp(req);
    const { login, password } = req.body || {};
    // Correct credentials always win over the limiter — no 15-minute lockout for the owner.
    if (credentialsValid(login, password)) {
        authFailures.delete(ip);
        const token = Buffer.from(`${login}:${password}`).toString('base64');
        return res.json({ success: true, token });
    }
    if (authRateLimited(ip)) return res.status(429).json({ error: 'Слишком много неудачных попыток входа. Попробуйте через 15 минут.' });
    recordAuthFailure(ip);
    res.status(401).json({ error: 'Неверный логин или пароль' });
});

// Режим входа: фронтенд по нему решает, показывать ли экран логина
app.get('/api/auth-mode', (req, res) => {
    res.json({ skipAuth: AUTH_SKIPPED });
});

function buildPublicCases(data) {
    const publicProjects = (data.projects || []).filter(project => project.status !== 'draft');
    const usedCategoryIds = new Set(publicProjects.map(project => project.categoryId).filter(Boolean));
    const publicCategories = Object.fromEntries(
        Object.entries(data.categories || {}).filter(([id]) => usedCategoryIds.has(id))
    );

    return { categories: publicCategories, projects: publicProjects };
}

// Атомарная запись: пишем во временный файл рядом и переименовываем.
// Прямой writeFileSync в целевой файл при падении или нехватке места
// оставляет обрезанный JSON — на нём падает весь сайт, а стартовый
// импорт из cases.json уже ничего не восстановит.
function writeJsonAtomic(targetPath, value) {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${targetPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmpPath, targetPath);
}

// Sync DB -> JSON
// Ошибка НЕ глотается: раньше запись падала, а клиент получал success:true
// и зелёный тост — пользователь был уверен, что сохранил, а на диске
// оставалось старое содержимое.
function syncToJsonFile(data) {
    const publicData = buildPublicCases(data);
    writeJsonAtomic(CASES_JSON_PATH, publicData);
    console.log('[A.LAB] Synced DB -> cases.json');
    return publicData;
}

// Сколько проектов сейчас опубликовано в public/data/cases.json.
// Возвращает null, если файл не читается: «ноль проектов» и «файл битый» —
// разные вещи, и защита от обнуления портфолио обязана срабатывать именно
// во второй ситуации, а не выключаться в ней.
function countJsonProjects() {
    if (!fs.existsSync(CASES_JSON_PATH)) return 0;
    try {
        const data = JSON.parse(fs.readFileSync(CASES_JSON_PATH, 'utf-8'));
        return Array.isArray(data.projects) ? data.projects.length : 0;
    } catch { return null; }
}

// Startup guard: empty DB + non-empty cases.json -> import JSON into the DB
function importCasesIfDbEmpty() {
    try {
        const current = getCases();
        if ((current.projects || []).length > 0) return;
        if (!fs.existsSync(CASES_JSON_PATH)) return;
        const fileData = JSON.parse(fs.readFileSync(CASES_JSON_PATH, 'utf-8'));
        if (!Array.isArray(fileData.projects) || fileData.projects.length === 0) return;
        saveCases(fileData);
        console.log(`[A.LAB] \u0411\u0414 \u0431\u044b\u043b\u0430 \u043f\u0443\u0441\u0442\u0430 \u2014 \u0438\u043c\u043f\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u043e ${fileData.projects.length} \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432 \u0438\u0437 cases.json`);
    } catch (e) {
        console.error('[A.LAB] Auto-import from cases.json failed:', e);
    }
}

function safeSegment(value, fallback = 'uploads') {
    const cleaned = String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);

    // Dot-only segments ('.', '..', '...') are path tricks \u2014 treat as invalid
    if (!cleaned || /^\.+$/.test(cleaned)) return fallback;
    return cleaned;
}

function safeFilename(originalName, fallback = 'media') {
    const ext = path.extname(originalName || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
    const stem = path.basename(originalName || fallback, path.extname(originalName || ''))
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || fallback;

    return `${Date.now()}-${stem}${ext}`;
}

function validateCasesPayload(payload) {
    if (!payload || typeof payload !== 'object') return 'Invalid payload';
    if (!payload.categories || typeof payload.categories !== 'object' || Array.isArray(payload.categories)) return 'Invalid categories';
    if (!Array.isArray(payload.projects)) return 'Invalid projects';
    return null;
}

// Multer for images
const imgStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const caseId = safeSegment(req.body.caseId, '');
        if (!caseId) return cb(new Error('caseId обязателен'));
        const uploadPath = path.join(IMAGES_DIR, caseId);
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => { cb(null, safeFilename(file.originalname)); }
});
const uploadImage = multer({ storage: imgStorage, fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','video/mp4','video/webm','video/quicktime'];
    cb(ok.includes(file.mimetype) ? null : new Error('Unsupported media type'), ok.includes(file.mimetype));
}, limits: { fileSize: 50 * 1024 * 1024 } });

// Multer for audio
const audioStorage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, AUDIO_DIR); },
    filename: (req, file, cb) => { cb(null, safeFilename(file.originalname, 'audio')); }
});
const uploadAudio = multer({ storage: audioStorage, fileFilter: (req, file, cb) => {
    const ok = ['audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/webm','audio/aac','audio/x-m4a','audio/mp4'];
    cb(ok.includes(file.mimetype) ? null : new Error('Unsupported audio type'), ok.includes(file.mimetype));
}, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// ─── Cases API ───
app.get('/api/cases', apiAuth, (req, res) => {
    try { res.json(getCases()); }
    catch (e) { res.status(500).json({ error: 'Read error' }); }
});

app.post('/api/cases', apiAuth, (req, res) => {
    const validationError = validateCasesPayload(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    // Guard: never silently wipe a non-empty portfolio with an empty payload.
    // На нечитаемом cases.json (countJsonProjects() === null) отказываем тоже:
    // именно в этой аварии защита и нужна.
    if (req.body.projects.length === 0) {
        const published = countJsonProjects();
        if (published === null) {
            return res.status(409).json({ error: 'Отказ: cases.json не читается, а вы сохраняете пустое портфолио. Проверьте файл вручную.' });
        }
        if (published > 0) {
            return res.status(409).json({ error: 'Отказ: попытка сохранить пустое портфолио поверх непустого. Если это намеренно, удалите проекты по одному.' });
        }
    }

    let savedData;
    try {
        // Автосохранение приходит часто — снимок не чаще раза в 15 минут
        backupDb('save', { throttle: true });
        saveCases(req.body);
        savedData = getCases();
    }
    catch (e) {
        console.error('[A.LAB] Save error:', e);
        return res.status(500).json({ error: 'Не удалось сохранить в базу: ' + e.message });
    }

    try {
        const publicData = syncToJsonFile(savedData);
        res.json({
            success: true,
            publicProjects: publicData.projects.length,
            draftProjects: savedData.projects.filter(project => project.status === 'draft').length
        });
    }
    catch (e) {
        console.error('[A.LAB] Sync error:', e);
        // База уже обновлена, а файл — нет. Молчать здесь нельзя: пользователь
        // будет уверен, что сохранил, и опубликует старое содержимое.
        res.status(500).json({ error: 'Данные сохранены в базу, но cases.json обновить не удалось: ' + e.message });
    }
});

app.get('/api/publish-status', apiAuth, async (req, res) => {
    try {
        const data = getCases();
        const publicData = buildPublicCases(data);
        // Ветку отдаём наружу, чтобы интерфейс мог предупредить ДО нажатия
        // кнопки: пуш не из main деплой не запускает.
        const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'])
            .then(r => r.stdout.trim()).catch(() => null);
        const workingCopy = await describeWorkingCopy().catch(() => ({ isWorktree: false }));
        res.json({
            publicProjects: publicData.projects.length,
            draftProjects: data.projects.filter(project => project.status === 'draft').length,
            publicCategories: Object.keys(publicData.categories).length,
            branch,
            publishBranch: PUBLISH_BRANCH,
            canPublish: branch === PUBLISH_BRANCH && !workingCopy.isWorktree,
            isWorktree: Boolean(workingCopy.isWorktree)
        });
    } catch (e) {
        console.error('[A.LAB] Status error:', e);
        res.status(500).json({ error: 'Status error' });
    }
});

app.delete('/api/projects/:id', apiAuth, (req, res) => {
    try {
        const data = getCases();
        const before = data.projects.length;
        data.projects = data.projects.filter(p => p.id !== req.params.id);
        if (data.projects.length === before) {
            return res.status(404).json({ error: 'Проект не найден' });
        }
        // Тот же барьер, что и при сохранении: удаление последнего проекта
        // не должно опустошать боевое портфолио одним запросом.
        if (data.projects.length === 0 && (countJsonProjects() ?? 1) > 0) {
            return res.status(409).json({ error: 'Отказ: это последний проект. Опустошить портфолио через API нельзя.' });
        }
        backupDb('delete');
        saveCases(data);
        syncToJsonFile(getCases());
        res.json({ success: true });
    } catch (e) {
        console.error('[A.LAB] Delete error:', e);
        res.status(500).json({ error: 'Не удалось удалить проект: ' + e.message });
    }
});

app.post('/api/upload', apiAuth, (req, res) => {
    uploadImage.single('media')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        const caseId = safeSegment(req.body.caseId, '');
        if (!caseId) return res.status(400).json({ error: 'caseId обязателен' });
        if (!req.file) return res.status(400).json({ error: 'No file' });

        const originalPath = req.file.path;
        const ext = path.extname(req.file.filename).toLowerCase();
        const basePath = `/images/${caseId}/${req.file.filename}`;

        // Auto-optimize images (skip SVG and video)
        if (['.jpg','.jpeg','.png','.webp','.tiff','.bmp'].includes(ext)) {
            try {
                const sharp = (await import('sharp')).default;
                const dir = path.dirname(originalPath);
                const name = path.basename(req.file.filename, ext);

                // Generate WebP version
                const webpPath = path.join(dir, name + '.webp');
                await sharp(originalPath).resize(1600, null, { withoutEnlargement: true }).webp({ quality: 82 }).toFile(webpPath);

                // Resize original if too large (>2000px), preserving the original format
                const meta = await sharp(originalPath).metadata();
                if (meta.width > 2000) {
                    const tmpPath = originalPath + '.tmp';
                    const resizer = sharp(originalPath).resize(2000, null, { withoutEnlargement: true });
                    if (ext === '.png') resizer.png();
                    else if (ext === '.webp') resizer.webp({ quality: 85 });
                    else resizer.jpeg({ quality: 85 });
                    await resizer.toFile(tmpPath);
                    fs.renameSync(tmpPath, originalPath);
                }

                console.log(`[Sharp] Optimized: ${req.file.filename} -> WebP + resize`);
            } catch (e) { console.error('[Sharp] Optimization failed:', e.message); }
        }

        res.json({ success: true, path: basePath });
    });
});

// ─── First-party Analytics API ───
function parseBodyObject(body) {
    if (!body) return {};
    if (typeof body === 'object') return body;
    try { return JSON.parse(body); } catch { return {}; }
}

function cleanHeader(value, limit = 160) {
    const raw = Array.isArray(value) ? value[0] : value;
    return String(raw || '').trim().slice(0, limit) || null;
}

function decodeHeader(value) {
    const raw = cleanHeader(value);
    if (!raw) return null;
    try { return decodeURIComponent(raw); } catch { return raw; }
}

function clientIp(req) {
    const forwarded = cleanHeader(req.headers['x-forwarded-for'], 320);
    if (forwarded) return forwarded.split(',')[0].trim();
    return cleanHeader(req.headers['x-real-ip']) || req.socket?.remoteAddress || '';
}

function hashIp(ip) {
    if (!ip) return null;
    const salt = process.env.ANALYTICS_SALT || 'alab-analytics';
    return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

function isBotUA(ua = '') {
    return /(bot|crawler|spider|crawling|preview|facebookexternalhit|telegrambot|whatsapp|slurp|bing|yandex|google-inspectiontool)/i.test(ua);
}

function detectDevice(ua = '') {
    if (/ipad|tablet|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobi|iphone|android/i.test(ua)) return 'mobile';
    return 'desktop';
}

function detectBrowser(ua = '') {
    if (/edg\//i.test(ua)) return 'Edge';
    if (/opr\//i.test(ua)) return 'Opera';
    if (/firefox\//i.test(ua)) return 'Firefox';
    if (/safari\//i.test(ua) && !/chrome|chromium|android/i.test(ua)) return 'Safari';
    if (/chrome|chromium/i.test(ua)) return 'Chrome';
    return 'unknown';
}

function detectOs(ua = '') {
    if (/windows/i.test(ua)) return 'Windows';
    if (/iphone|ipad|ios/i.test(ua)) return 'iOS';
    if (/mac os|macintosh/i.test(ua)) return 'macOS';
    if (/android/i.test(ua)) return 'Android';
    if (/linux/i.test(ua)) return 'Linux';
    return 'unknown';
}

function readSeoTag(html, pattern) {
    const match = html.match(pattern);
    return match ? match[1].trim() : '';
}

function seoCheck(label, ok, detail, weight = 1) {
    return { label, ok: !!ok, detail, weight };
}

function getSeoAudit() {
    const html = fs.existsSync(path.join(ROOT_DIR, 'index.html')) ? fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf-8') : '';
    const robotsPath = path.join(ROOT_DIR, 'public', 'robots.txt');
    const sitemapPath = path.join(ROOT_DIR, 'public', 'sitemap.xml');
    const title = readSeoTag(html, /<title>([^<]+)<\/title>/i);
    const description = readSeoTag(html, /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    const canonical = readSeoTag(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
    const ogImage = readSeoTag(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    const h1Count = (html.match(/<h1\b/gi) || []).length;
    const checks = [
        seoCheck('Title', title.length >= 30 && title.length <= 75, title ? `${title.length} символов` : 'не найден'),
        seoCheck('Description', description.length >= 90 && description.length <= 180, description ? `${description.length} символов` : 'не найдена'),
        seoCheck('Canonical', /^https?:\/\//.test(canonical), canonical || 'не найден'),
        seoCheck('Open Graph image', /^https?:\/\//.test(ogImage), ogImage || 'не найден'),
        seoCheck('JSON-LD schema', /application\/ld\+json/i.test(html), 'структурированные данные'),
        seoCheck('Robots.txt', fs.existsSync(robotsPath), fs.existsSync(robotsPath) ? 'найден' : 'не найден'),
        seoCheck('Sitemap.xml', fs.existsSync(sitemapPath), fs.existsSync(sitemapPath) ? 'найден' : 'не найден'),
        seoCheck('H1', h1Count === 1, `${h1Count} на странице`),
        seoCheck('lang=ru', /<html[^>]+lang=["']ru["']/i.test(html), 'язык страницы'),
        seoCheck('Favicon', /rel=["']icon["']/i.test(html), 'иконка вкладки')
    ];
    const weightSum = checks.reduce((sum, item) => sum + item.weight, 0);
    const score = Math.round((checks.filter(item => item.ok).reduce((sum, item) => sum + item.weight, 0) / weightSum) * 100);
    return { score, title, description, canonical, checks };
}

app.post('/api/analytics/collect', (req, res) => {
    try {
        const body = parseBodyObject(req.body);
        if (body.dnt) return res.status(202).json({ success: true, skipped: 'dnt' });

        const ua = cleanHeader(req.headers['user-agent'], 500) || body.userAgent || '';
        const url = body.url ? new URL(String(body.url), 'https://alabspace.com') : null;
        const search = url ? url.searchParams : new URLSearchParams();

        recordAnalyticsEvent({
            ts: new Date().toISOString(),
            type: body.type || 'event',
            visitorId: body.visitorId,
            sessionId: body.sessionId,
            path: body.path || (url ? `${url.pathname}${url.search}${url.hash}` : '/'),
            title: body.title,
            referrer: body.referrer,
            source: body.source || search.get('utm_source') || null,
            medium: body.medium || search.get('utm_medium') || null,
            campaign: body.campaign || search.get('utm_campaign') || null,
            country: decodeHeader(req.headers['x-vercel-ip-country']) || decodeHeader(req.headers['cf-ipcountry']) || body.country || null,
            region: decodeHeader(req.headers['x-vercel-ip-country-region']) || body.region || null,
            city: decodeHeader(req.headers['x-vercel-ip-city']) || body.city || null,
            timezone: body.timezone,
            language: body.language,
            device: body.device || detectDevice(ua),
            browser: body.browser || detectBrowser(ua),
            os: body.os || detectOs(ua),
            viewport: body.viewport,
            screen: body.screen,
            dpr: body.dpr,
            connection: body.connection,
            // Условие было перевёрнуто: «не настроено» показывалось именно тогда,
            // когда токен как раз задан
            vpnStatus: process.env.IPINFO_TOKEN ? 'unknown' : 'not_configured',
            isBot: isBotUA(ua),
            duration: body.duration,
            ipHash: hashIp(clientIp(req)),
            userAgent: ua,
            metadata: body.metadata || {}
        });

        res.status(202).json({ success: true });
    } catch (e) {
        console.error('[A.LAB] Analytics collect error:', e);
        res.status(202).json({ success: false });
    }
});

app.get('/api/analytics/summary', apiAuth, (req, res) => {
    try {
        res.json({ ...getAnalyticsSummary(req.query.days), seo: getSeoAudit() });
    } catch (e) {
        console.error('[A.LAB] Analytics summary error:', e);
        res.status(500).json({ error: 'Analytics summary error' });
    }
});

// ─── Settings API ───
// Only these top-level keys ever reach the deployed settings.json
// (verified against public/data/settings.json and the editor UI).
// Secrets like figmaToken are dropped silently — tokens live in .env only.
const SETTINGS_ALLOWED_KEYS = ['audio', 'typography', 'cards'];

function filterSettings(data) {
    const incoming = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    const filtered = {};
    for (const key of SETTINGS_ALLOWED_KEYS) {
        if (key in incoming) filtered[key] = incoming[key];
    }
    return filtered;
}

const DEFAULT_SETTINGS = { audio: { enabled: false, letters: [], masterVolume: 0.35 } };

// «Файла нет» и «файл не парсится» — разные ситуации. Раньше обе давали
// дефолтную заглушку, и повреждённый settings.json молча перезаписывался
// ею при публикации: typography и cards исчезали и с диска, и с сайта.
function getSettings() {
    if (!fs.existsSync(SETTINGS_JSON_PATH)) return { ...DEFAULT_SETTINGS };
    const raw = fs.readFileSync(SETTINGS_JSON_PATH, 'utf-8');
    try {
        return JSON.parse(raw);
    } catch (e) {
        throw new Error(`settings.json повреждён и не разбирается: ${e.message}`);
    }
}

// Безопасное чтение для мест, где отказ недопустим (например, отдать клиенту
// хоть что-то). Возвращает null, если файл битый, — вызывающий решает сам.
function getSettingsSafe() {
    try { return getSettings(); } catch { return null; }
}

function saveSettings(data) {
    // Whitelist applied on EVERY write (including the /api/publish re-save):
    // a legacy figmaToken left on disk by the old editor must never survive a re-save,
    // let alone reach a public git commit.
    writeJsonAtomic(SETTINGS_JSON_PATH, filterSettings(data));
    console.log('[A.LAB] Settings saved');
}

app.get('/api/settings', apiAuth, (req, res) => {
    const current = getSettingsSafe();
    if (!current) return res.status(422).json({ error: 'settings.json повреждён и не разбирается' });
    // Whitelist и на чтение: инвариант «секреты только в .env» должен быть
    // симметричным, иначе забытый на диске токен уедет клиенту.
    res.json(filterSettings(current));
});

app.post('/api/settings', apiAuth, (req, res) => {
    try {
        // Слияние, а не подмена: filterSettings копирует только присутствующие
        // ключи, поэтому частичный запрос от клиента раньше стирал остальные
        // разделы настроек целиком.
        const current = getSettingsSafe() || { ...DEFAULT_SETTINGS };
        saveSettings({ ...current, ...(req.body && typeof req.body === 'object' ? req.body : {}) });
        res.json({ success: true });
    }
    catch (e) {
        console.error('[A.LAB] Settings save error:', e);
        res.status(500).json({ error: 'Не удалось сохранить настройки: ' + e.message });
    }
});

app.post('/api/upload-audio', apiAuth, (req, res) => {
    uploadAudio.single('audio')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No file' });
        res.json({ success: true, path: `/audio/${req.file.filename}` });
    });
});

const PORT = process.env.PORT || 3001;

// ─── Figma Image Import ───
app.post('/api/figma-import', apiAuth, async (req, res) => {
  try {
    const { figmaUrl } = req.body;
    if (!figmaUrl) return res.status(400).json({ error: 'URL не указан' });

    const caseId = safeSegment(req.body.caseId, '');
    if (!caseId) return res.status(400).json({ error: 'caseId обязателен' });

    // Figma token comes from the environment only — never from settings.json
    const figmaToken = process.env.FIGMA_TOKEN;
    if (!figmaToken) return res.status(400).json({ error: 'Figma токен не задан. Добавьте FIGMA_TOKEN в .env и перезапустите редактор.' });

    // Parse Figma URL: https://www.figma.com/file/FILE_KEY/... or /design/FILE_KEY/...
    // node-id can be in URL params or query
    let fileKey, nodeId;
    const urlObj = new URL(figmaUrl);
    const pathParts = urlObj.pathname.split('/');
    
    // Find file key (after /file/ or /design/ or /proto/)
    for (let i = 0; i < pathParts.length; i++) {
      if (['file', 'design', 'proto'].includes(pathParts[i]) && pathParts[i+1]) {
        fileKey = pathParts[i+1];
        break;
      }
    }
    
    // Node ID from query params
    nodeId = urlObj.searchParams.get('node-id');
    
    if (!fileKey) return res.status(400).json({ error: 'Не удалось определить файл Figma из URL' });

    // Request image export from Figma API
    const figmaApiUrl = nodeId 
      ? `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&format=png&scale=2`
      : `https://api.figma.com/v1/images/${fileKey}?format=png&scale=2`;
    
    const figmaRes = await fetch(figmaApiUrl, {
      headers: { 'X-Figma-Token': figmaToken }
    });
    
    const figmaData = await figmaRes.json();
    
    if (figmaData.err) {
      return res.status(400).json({ error: 'Ошибка Figma: ' + (figmaData.err || figmaData.status) });
    }

    // Get the image URL from response
    const images = figmaData.images || {};
    const imageUrl = Object.values(images)[0];
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'Figma не вернула изображение. Убедитесь что node-id указан в URL.' });
    }

    // Download the image and save locally into the case's own folder
    const imgRes = await fetch(imageUrl);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    const targetDir = path.join(IMAGES_DIR, caseId);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const filename = 'figma-' + Date.now() + '.png';
    const filePath = path.join(targetDir, filename);
    fs.writeFileSync(filePath, imgBuffer);

    const publicPath = `/images/${caseId}/${filename}`;
    res.json({ path: publicPath, source: 'figma', nodeId });
    
  } catch (err) {
    console.error('[Figma Import]', err);
    res.status(500).json({ error: 'Ошибка импорта: ' + err.message });
  }
});

// ─── Publish to GitHub (content -> git commit -> push) ───
const GIT_PUBLISH_PATHS = ['public/data', 'public/images', 'public/audio'];

// Ветка, из которой разрешена публикация: только с неё GitHub Actions
// собирает и выкладывает Pages (.github/workflows/deploy.yml)
const PUBLISH_BRANCH = process.env.CMS_PUBLISH_BRANCH || 'main';

function runGit(args, { timeout = 30000 } = {}) {
    return new Promise((resolve, reject) => {
        execFile('git', args, {
            cwd: ROOT_DIR,
            timeout,
            maxBuffer: 10 * 1024 * 1024,
            // Без этого git при незакешированных учётных данных уходит в
            // интерактивный запрос пароля и немо висит до таймаута
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' }
        }, (err, stdout, stderr) => {
            if (err) {
                err.stdout = stdout;
                err.stderr = stderr;
                return reject(err);
            }
            resolve({ stdout, stderr });
        });
    });
}

// Публикация должна идти из основной рабочей копии: в git-воркте пуш уйдёт
// в фиче-ветку, деплой не сработает, а редактор отрапортует об успехе.
async function describeWorkingCopy() {
    const [gitDir, commonDir] = await Promise.all([
        runGit(['rev-parse', '--absolute-git-dir']).then(r => r.stdout.trim()).catch(() => ''),
        runGit(['rev-parse', '--path-format=absolute', '--git-common-dir']).then(r => r.stdout.trim()).catch(() => '')
    ]);
    return { gitDir, commonDir, isWorktree: Boolean(gitDir && commonDir && gitDir !== commonDir) };
}

// Одновременная публикация ломает git index.lock и оставляет содержимое
// в staged, откуда его утащит следующий посторонний коммит
let publishInFlight = false;

// Recursively collect strings that look like local media paths
function collectMediaPaths(value, out = new Set()) {
    if (typeof value === 'string') {
        if (value.startsWith('/images/') || value.startsWith('/audio/')) out.add(value);
        // Media embedded inside rich-text/raw HTML strings (src/href attributes)
        for (const match of value.matchAll(/(?:src|href)=["'](\/(?:images|audio)\/[^"']+)["']/gi)) {
            out.add(match[1]);
        }
    } else if (Array.isArray(value)) {
        for (const item of value) collectMediaPaths(item, out);
    } else if (value && typeof value === 'object') {
        for (const item of Object.values(value)) collectMediaPaths(item, out);
    }
    return out;
}

app.post('/api/publish', apiAuth, async (req, res) => {
    if (publishInFlight) {
        return res.status(409).json({ error: 'Публикация уже выполняется — дождитесь её завершения.' });
    }
    publishInFlight = true;
    let committed = false;
    let staging = false;
    try {
        const dryRun = Boolean(req.body?.dryRun);

        // a0. Публиковать можно только из main и только из основной рабочей копии.
        //     Проверка идёт ДО git add: иначе при отказе содержимое остаётся в индексе.
        const branch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
        if (branch === 'HEAD') {
            return res.status(409).json({ error: 'Git в состоянии detached HEAD — переключитесь на ветку и повторите публикацию.' });
        }
        if (branch !== PUBLISH_BRANCH) {
            return res.status(409).json({
                error: `Публикация возможна только из ветки «${PUBLISH_BRANCH}», сейчас «${branch}». Пуш из другой ветки не запускает деплой, и сайт не обновится.`,
                branch
            });
        }
        const workingCopy = await describeWorkingCopy();
        if (workingCopy.isWorktree) {
            return res.status(409).json({
                error: 'Редактор запущен из git-воркти. Публикуйте из основной папки проекта, иначе деплой не сработает.',
                branch
            });
        }

        // a. Never publish an empty DB over a non-empty cases.json
        const dbData = getCases();
        const publishedCount = countJsonProjects();
        if ((dbData.projects || []).length === 0 && (publishedCount ?? 1) > 0) {
            return res.status(409).json({ error: 'Отказ: база данных пуста, а cases.json содержит проекты (или не читается). Публикация остановлена.' });
        }

        backupDb('publish');

        // b. Regenerate public/data/*.json from current state
        const publicData = syncToJsonFile(dbData);
        // Пересохранение прогоняет whitelist по файлу на диске. Если файл
        // повреждён — останавливаемся, а не подменяем его заглушкой.
        let currentSettings;
        try {
            currentSettings = getSettings();
        } catch (e) {
            return res.status(422).json({ error: `Публикация остановлена: ${e.message}. Восстановите public/data/settings.json и повторите.` });
        }
        saveSettings(currentSettings);

        // c. Media integrity for published projects
        const mediaPaths = new Set();
        for (const project of publicData.projects) collectMediaPaths(project, mediaPaths);

        const missing = [];
        const untracked = [];
        for (const mediaPath of mediaPaths) {
            const clean = mediaPath.split('?')[0].split('#')[0];
            if (clean.startsWith('/images/uploads/')) { untracked.push(clean); continue; }
            let decoded = clean;
            try { decoded = decodeURIComponent(clean); } catch {}
            const resolved = path.resolve(PUBLIC_DIR, '.' + decoded);
            if (!resolved.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(resolved)) missing.push(clean);
        }
        if (missing.length || untracked.length) {
            return res.status(422).json({
                error: 'Публикация остановлена: найдены отсутствующие файлы или файлы из временной папки uploads.',
                missing,
                untracked
            });
        }

        // d. Stage content and check whether anything changed — scoped to the publish
        //    paths only, so files pre-staged by a developer are neither counted nor committed
        staging = true;
        await runGit(['add', ...GIT_PUBLISH_PATHS]);
        const staged = (await runGit(['diff', '--cached', '--name-only', '--', ...GIT_PUBLISH_PATHS])).stdout
            .split('\n').map(line => line.trim()).filter(Boolean);

        if (staged.length === 0) {
            // Nothing new to commit — but a previous publish may have committed
            // and then failed to push (network down, timeout). Recover it here.
            await runGit(['fetch', 'origin']);
            let unpushed = 0;
            try {
                await runGit(['rev-parse', '--verify', '--quiet', `origin/${branch}`]);
                unpushed = parseInt((await runGit(['rev-list', '--count', `origin/${branch}..HEAD`])).stdout.trim(), 10) || 0;
            } catch { unpushed = 0; }

            if (unpushed > 0 && !dryRun) {
                const originAhead = parseInt((await runGit(['rev-list', '--count', `HEAD..origin/${branch}`])).stdout.trim(), 10) || 0;
                if (originAhead > 0) {
                    return res.json({ published: false, unpushedCommits: unpushed, message: 'Есть неотправленные коммиты, но на GitHub более новые изменения — нужен pull' });
                }
                // Only auto-push if the unpushed commits touch nothing outside the content paths
                const foreign = (await runGit(['diff', '--name-only', `origin/${branch}..HEAD`])).stdout
                    .split('\n').map(line => line.trim()).filter(Boolean)
                    .filter(p => !GIT_PUBLISH_PATHS.some(base => p === base || p.startsWith(`${base}/`)));
                if (foreign.length > 0) {
                    return res.json({ published: false, unpushedCommits: unpushed, message: 'Есть неотправленные коммиты с изменениями вне контента — отправьте их вручную (git push)' });
                }
                await runGit(['push', 'origin', 'HEAD'], { timeout: 120000 });
                const sha = (await runGit(['rev-parse', 'HEAD'])).stdout.trim();
                return res.json({ published: true, pushed: true, sha, message: 'Отправлен ранее неопубликованный коммит' });
            }
            return res.json({ published: false, message: 'Нет изменений для публикации', unpushedCommits: unpushed });
        }

        // e. Dry run: unstage and report
        if (dryRun) {
            await runGit(['reset', '--', ...GIT_PUBLISH_PATHS]);
            return res.json({ published: false, dryRun: true, wouldCommit: staged });
        }

        // f. Check origin BEFORE committing (a failed fetch must not strand a local
        //    commit), then commit only the publish paths and push
        await runGit(['fetch', 'origin']);
        let originAhead = 0;
        try {
            await runGit(['rev-parse', '--verify', '--quiet', `origin/${branch}`]);
            originAhead = parseInt((await runGit(['rev-list', '--count', `HEAD..origin/${branch}`])).stdout.trim(), 10) || 0;
        } catch {
            originAhead = 0; // no remote branch yet — safe to push
        }

        await runGit(['commit', '-m', 'content: публикация из редактора', '-m', 'Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>', '--', ...GIT_PUBLISH_PATHS]);
        committed = true;
        staging = false;
        const sha = (await runGit(['rev-parse', 'HEAD'])).stdout.trim();

        if (originAhead > 0) {
            return res.json({
                published: true,
                pushed: false,
                sha,
                warning: 'Закоммичено локально; на GitHub есть более новые изменения — нужен pull'
            });
        }

        await runGit(['push', 'origin', 'HEAD'], { timeout: 120000 });
        res.json({ published: true, pushed: true, sha });
    } catch (e) {
        console.error('[A.LAB] Publish error:', e);
        // Снимаем содержимое с индекса, если коммит ещё не был создан: иначе
        // после сбоя public/ остаётся в staged и уедет в посторонний коммит.
        if (staging && !committed) {
            try { await runGit(['reset', '--', ...GIT_PUBLISH_PATHS]); }
            catch (resetError) { console.error('[A.LAB] Не удалось откатить индекс:', resetError.message); }
        }
        const detail = String(e?.stderr || e?.message || e).trim().slice(0, 400);
        res.status(500).json({ error: `Ошибка git при публикации: ${detail}` });
    } finally {
        publishInFlight = false;
    }
});

// ─── Startup ───
if (AUTH_SKIPPED) {
    console.warn('[A.LAB] Вход без пароля: CMS_SKIP_AUTH=1 — экран логина отключён (сервер виден только с этого компьютера)');
} else if (!authConfigured()) {
    console.warn('[A.LAB] ВНИМАНИЕ: CMS_LOGIN/CMS_PASSWORD не заданы в .env — все API-запросы будут отклоняться (503)');
}

// Этот же инструмент делает git push в боевой репозиторий. Стартовать с
// парой из .env.example нельзя: достаточно один раз пробросить порт наружу.
const DEFAULT_CREDENTIALS = [['ALAB', 'ALAB'], ['admin', 'admin'], ['alab', 'alab']];
const usingDefaultCreds = DEFAULT_CREDENTIALS.some(
    ([login, password]) => process.env.CMS_LOGIN === login && process.env.CMS_PASSWORD === password
);
if (usingDefaultCreds && !process.env.CMS_ALLOW_DEFAULT_CREDS) {
    console.error('[A.LAB] ОСТАНОВЛЕНО: в .env стоят учётные данные по умолчанию из .env.example.');
    console.error('[A.LAB] Задайте свои CMS_LOGIN и CMS_PASSWORD — редактор публикует сайт в интернет.');
    console.error('[A.LAB] Если это осознанный локальный запуск, поставьте CMS_ALLOW_DEFAULT_CREDS=1');
    process.exit(1);
}
if (!process.env.ANALYTICS_SALT) {
    console.warn('[A.LAB] ВНИМАНИЕ: ANALYTICS_SALT не задан в .env — используется соль по умолчанию');
}

importCasesIfDbEmpty();

if (!process.env.VERCEL) {
    app.listen(PORT, '127.0.0.1', () => {
        console.log(`[A.LAB] CMS at http://localhost:${PORT}`);
        console.log(`[A.LAB] CMS prefix at http://localhost:${PORT}${CMS_BASE_PATH}/`);
    });
}

export default app;
