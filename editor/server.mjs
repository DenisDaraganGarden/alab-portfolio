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
const CASES_JSON_PATH = path.join(ROOT_DIR, 'public', 'data', 'cases.json');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Static files — no auth (login page needs to load)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(ROOT_DIR, 'public', 'images')));
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

// Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const caseId = req.body.caseId;
        const uploadPath = path.join(IMAGES_DIR, caseId || 'uploads');
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_')); }
});
const upload = multer({ storage, fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','video/mp4','video/webm','video/quicktime'];
    cb(null, ok.includes(file.mimetype));
}});

// Protected API routes
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
    upload.single('media')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No file' });
        res.json({ success: true, path: `/images/${req.body.caseId || 'uploads'}/${req.file.filename}` });
    });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`[A.LAB] CMS at http://localhost:${PORT}`));
