import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getCases, saveCases, recordAnalyticsEvent, getAnalyticsSummary } from './db.mjs';

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
app.use(cors());
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
app.use('/site', express.static(ROOT_DIR));

// Auth middleware — only for /api routes
const apiAuth = (req, res, next) => {
    const token = req.headers['x-cms-token'];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        const decoded = Buffer.from(token, 'base64').toString();
        const [login, password] = decoded.split(':');
        const envLogin = process.env.CMS_LOGIN || 'ALAB';
        const envPassword = process.env.CMS_PASSWORD || 'ALAB';
        if (login === envLogin && password === envPassword) return next();
    } catch(e) {}
    res.status(401).json({ error: 'Invalid credentials' });
};

// Auth check endpoint
app.post('/api/login', (req, res) => {
    const { login, password } = req.body;
    const envLogin = process.env.CMS_LOGIN || 'ALAB';
    const envPassword = process.env.CMS_PASSWORD || 'ALAB';
    if (login === envLogin && password === envPassword) {
        const token = Buffer.from(`${login}:${password}`).toString('base64');
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Неверный логин или пароль' });
    }
});

function buildPublicCases(data) {
    const publicProjects = (data.projects || []).filter(project => project.status !== 'draft');
    const usedCategoryIds = new Set(publicProjects.map(project => project.categoryId).filter(Boolean));
    const publicCategories = Object.fromEntries(
        Object.entries(data.categories || {}).filter(([id]) => usedCategoryIds.has(id))
    );

    return { categories: publicCategories, projects: publicProjects };
}

// Sync DB -> JSON
function syncToJsonFile(data) {
    try {
        const publicData = buildPublicCases(data);
        const dir = path.dirname(CASES_JSON_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CASES_JSON_PATH, JSON.stringify(publicData, null, 2), 'utf-8');
        console.log('[A.LAB] Synced DB -> cases.json');
        return publicData;
    } catch (e) { console.error('[A.LAB] Sync error:', e); }
}

function safeSegment(value, fallback = 'uploads') {
    const cleaned = String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);

    return cleaned || fallback;
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
        const caseId = safeSegment(req.body.caseId);
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

    try {
        saveCases(req.body);
        const savedData = getCases();
        const publicData = syncToJsonFile(savedData);
        res.json({
            success: true,
            publicProjects: publicData?.projects?.length || 0,
            draftProjects: savedData.projects.filter(project => project.status === 'draft').length
        });
    }
    catch (e) {
        console.error('[A.LAB] Save error:', e);
        res.status(500).json({ error: 'Save error' });
    }
});

app.get('/api/publish-status', apiAuth, (req, res) => {
    try {
        const data = getCases();
        const publicData = buildPublicCases(data);
        res.json({
            publicProjects: publicData.projects.length,
            draftProjects: data.projects.filter(project => project.status === 'draft').length,
            publicCategories: Object.keys(publicData.categories).length
        });
    } catch (e) {
        res.status(500).json({ error: 'Status error' });
    }
});

app.delete('/api/projects/:id', apiAuth, (req, res) => {
    try {
        const data = getCases();
        data.projects = data.projects.filter(p => p.id !== req.params.id);
        saveCases(data); syncToJsonFile(data);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Delete error' }); }
});

app.post('/api/upload', apiAuth, (req, res) => {
    uploadImage.single('media')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No file' });

        const originalPath = req.file.path;
        const ext = path.extname(req.file.filename).toLowerCase();
        const basePath = `/images/${safeSegment(req.body.caseId)}/${req.file.filename}`;

        // Auto-optimize images (skip SVG and video)
        if (['.jpg','.jpeg','.png','.webp','.tiff','.bmp'].includes(ext)) {
            try {
                const sharp = (await import('sharp')).default;
                const dir = path.dirname(originalPath);
                const name = path.basename(req.file.filename, ext);

                // Generate WebP version
                const webpPath = path.join(dir, name + '.webp');
                await sharp(originalPath).resize(1600, null, { withoutEnlargement: true }).webp({ quality: 82 }).toFile(webpPath);

                // Resize original if too large (>2000px)
                const meta = await sharp(originalPath).metadata();
                if (meta.width > 2000) {
                    const tmpPath = originalPath + '.tmp';
                    await sharp(originalPath).resize(2000, null, { withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(tmpPath);
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
    const salt = process.env.ANALYTICS_SALT || process.env.CMS_PASSWORD || 'alab-analytics';
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
            vpnStatus: process.env.IPINFO_TOKEN ? 'not_configured' : 'unknown',
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
function getSettings() {
    try {
        if (fs.existsSync(SETTINGS_JSON_PATH)) {
            return JSON.parse(fs.readFileSync(SETTINGS_JSON_PATH, 'utf-8'));
        }
    } catch(e) {}
    return { audio: { enabled: false, letters: [], masterVolume: 0.35 } };
}

function saveSettings(data) {
    const dir = path.dirname(SETTINGS_JSON_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.log('[A.LAB] Settings saved');
}

app.get('/api/settings', apiAuth, (req, res) => {
    res.json(getSettings());
});

app.post('/api/settings', apiAuth, (req, res) => {
    try { saveSettings(req.body); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: 'Save error' }); }
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

    // Load Figma token from settings
    const settingsPath = SETTINGS_JSON_PATH;
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch(e) {}
    const figmaToken = settings.figmaToken;
    if (!figmaToken) return res.status(400).json({ error: 'Figma токен не задан. Добавьте его в Настройках сайта.' });

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

    // Download the image and save locally
    const imgRes = await fetch(imageUrl);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    
    const uploadsDir = path.join(PUBLIC_DIR, 'images', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    
    const filename = 'figma-' + Date.now() + '.png';
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, imgBuffer);
    
    const publicPath = '/images/uploads/' + filename;
    res.json({ path: publicPath, source: 'figma', nodeId });
    
  } catch (err) {
    console.error('[Figma Import]', err);
    res.status(500).json({ error: 'Ошибка импорта: ' + err.message });
  }
});

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`[A.LAB] CMS at http://localhost:${PORT}`);
        console.log(`[A.LAB] CMS prefix at http://localhost:${PORT}${CMS_BASE_PATH}/`);
    });
}

export default app;
