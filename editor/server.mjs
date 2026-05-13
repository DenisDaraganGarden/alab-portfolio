import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getCases, saveCases } from './db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });
const IMAGES_DIR = path.join(ROOT_DIR, 'public', 'images');
const AUDIO_DIR = path.join(ROOT_DIR, 'public', 'audio');
const CASES_JSON_PATH = path.join(ROOT_DIR, 'public', 'data', 'cases.json');
const SETTINGS_JSON_PATH = path.join(ROOT_DIR, 'public', 'data', 'settings.json');

// Ensure audio dir exists
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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

// Sync DB -> JSON
function syncToJsonFile(data) {
    try {
        const dir = path.dirname(CASES_JSON_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CASES_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');
        console.log('[A.LAB] Synced DB -> cases.json');
    } catch (e) { console.error('[A.LAB] Sync error:', e); }
}

// Multer for images
const imgStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const caseId = req.body.caseId;
        const uploadPath = path.join(IMAGES_DIR, caseId || 'uploads');
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_')); }
});
const uploadImage = multer({ storage: imgStorage, fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','video/mp4','video/webm','video/quicktime'];
    cb(null, ok.includes(file.mimetype));
}});

// Multer for audio
const audioStorage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, AUDIO_DIR); },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_')); }
});
const uploadAudio = multer({ storage: audioStorage, fileFilter: (req, file, cb) => {
    const ok = ['audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/webm','audio/aac','audio/x-m4a','audio/mp4'];
    cb(null, ok.includes(file.mimetype));
}, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// ─── Cases API ───
app.get('/api/cases', apiAuth, (req, res) => {
    try { res.json(getCases()); }
    catch (e) { res.status(500).json({ error: 'Read error' }); }
});

app.post('/api/cases', apiAuth, (req, res) => {
    try { saveCases(req.body); syncToJsonFile(req.body); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: 'Save error' }); }
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
        const ext = path.extname(req.file.originalname).toLowerCase();
        const basePath = `/images/${req.body.caseId || 'uploads'}/${req.file.filename}`;

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

                console.log(`[Sharp] Optimized: ${req.file.filename} → WebP + resize`);
            } catch (e) { console.error('[Sharp] Optimization failed:', e.message); }
        }

        res.json({ success: true, path: basePath });
    });
});

// ─── Settings API ───
function getSettings() {
    try {
        if (fs.existsSync(SETTINGS_JSON_PATH)) {
            return JSON.parse(fs.readFileSync(SETTINGS_JSON_PATH, 'utf-8'));
        }
    } catch(e) {}
    return { audio: { letters: [], masterVolume: 0.35 } };
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

const PORT = 3001;

// ─── Figma Image Import ───
app.post('/api/figma-import', apiAuth, async (req, res) => {
  try {
    const { figmaUrl } = req.body;
    if (!figmaUrl) return res.status(400).json({ error: 'URL не указан' });

    // Load Figma token from settings
    const settingsPath = path.join(PUBLIC_DIR, 'data', 'settings.json');
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

app.listen(PORT, () => console.log(`[A.LAB] CMS at http://localhost:${PORT}`));
