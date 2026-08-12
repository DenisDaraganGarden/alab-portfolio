import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// DB stored in editor directory
const dbPath = path.join(__dirname, 'cms.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// ─── Резервные копии ──────────────────────────────────────────────────
// База — единственный источник истины по контенту, и до сих пор весь запас
// прочности состоял из одного снимка, снятого руками. Копия делается через
// VACUUM INTO: в отличие от копирования файла, она корректно захватывает
// несброшенный WAL и не может поймать базу в середине транзакции.
const BACKUP_DIR = path.join(__dirname, 'backups');
const BACKUP_KEEP = 12;
const BACKUP_MIN_INTERVAL_MS = 15 * 60 * 1000;
let lastBackupAt = 0;

export function backupDb(label = 'auto', { throttle = false } = {}) {
    try {
        if (throttle && Date.now() - lastBackupAt < BACKUP_MIN_INTERVAL_MS) return null;
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const target = path.join(BACKUP_DIR, `cms-${stamp}-${label}.db`);
        if (fs.existsSync(target)) return null;

        db.prepare('VACUUM INTO ?').run(target);
        lastBackupAt = Date.now();

        // Ротация: имена начинаются с отсортированной по возрастанию метки времени
        const stale = fs.readdirSync(BACKUP_DIR)
            .filter(name => name.startsWith('cms-') && name.endsWith('.db'))
            .sort();
        for (const name of stale.slice(0, Math.max(0, stale.length - BACKUP_KEEP))) {
            try { fs.unlinkSync(path.join(BACKUP_DIR, name)); } catch {}
        }
        console.log(`[A.LAB] Бэкап базы: ${path.basename(target)}`);
        return target;
    } catch (e) {
        // Бэкап не должен блокировать сохранение — но молчать о провале нельзя
        console.error('[A.LAB] Не удалось создать бэкап базы:', e.message);
        return null;
    }
}

// Initialize schema
db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        logo TEXT,
        isExternal INTEGER NOT NULL DEFAULT 0,
        categoryId TEXT,
        blocks TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        type TEXT NOT NULL,
        visitor_id TEXT,
        session_id TEXT,
        path TEXT,
        title TEXT,
        referrer TEXT,
        source TEXT,
        medium TEXT,
        campaign TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        timezone TEXT,
        language TEXT,
        device TEXT,
        browser TEXT,
        os TEXT,
        viewport TEXT,
        screen TEXT,
        dpr REAL,
        connection TEXT,
        vpn_status TEXT DEFAULT 'unknown',
        is_bot INTEGER NOT NULL DEFAULT 0,
        duration INTEGER DEFAULT 0,
        ip_hash TEXT,
        user_agent TEXT,
        metadata TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_ts ON analytics_events(ts);
    CREATE INDEX IF NOT EXISTS idx_analytics_type_ts ON analytics_events(type, ts);
    CREATE INDEX IF NOT EXISTS idx_analytics_session_ts ON analytics_events(session_id, ts);
`);

const requiredProjectColumns = {
    status: "TEXT DEFAULT 'published'",
    theme: "TEXT DEFAULT 'light'",
    accentColor: "TEXT DEFAULT '#6b6b6b'",
    seoTitle: 'TEXT DEFAULT NULL',
    seoDesc: 'TEXT DEFAULT NULL',
    ogImage: 'TEXT DEFAULT NULL',
    externalUrl: 'TEXT DEFAULT NULL',
    featured: 'INTEGER DEFAULT 0',
    tagline: 'TEXT DEFAULT NULL'
};

function ensureColumns(tableName, columns) {
    const existing = new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map(column => column.name));

    for (const [name, definition] of Object.entries(columns)) {
        if (!existing.has(name)) {
            db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${definition}`);
        }
    }
}

ensureColumns('projects', requiredProjectColumns);

function parseBlocks(value, projectId) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn(`[A.LAB] Invalid blocks JSON for ${projectId}:`, error.message);
        return [];
    }
}

export function getCases() {
    const categoriesRows = db.prepare('SELECT id, title FROM categories').all();
    const categories = {};
    for (const row of categoriesRows) {
        categories[row.id] = row.title;
    }

    const projectsRows = db.prepare('SELECT * FROM projects ORDER BY sort_order ASC').all();
    const projects = projectsRows.map(row => ({
        id: row.id,
        title: row.title,
        logo: row.logo || undefined,
        isExternal: row.isExternal === 1,
        categoryId: row.categoryId,
        blocks: parseBlocks(row.blocks, row.id),
        status: row.status || 'published',
        theme: row.theme || 'light',
        accentColor: row.accentColor || '#6b6b6b',
        seoTitle: row.seoTitle || undefined,
        seoDesc: row.seoDesc || undefined,
        ogImage: row.ogImage || undefined,
        externalUrl: row.externalUrl || undefined,
        featured: row.featured === 1 ? true : undefined,
        tagline: row.tagline || undefined
    }));

    return { categories, projects };
}

export function saveCases(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid cases payload');
    }

    const categories = payload.categories && typeof payload.categories === 'object' ? payload.categories : {};
    const projects = Array.isArray(payload.projects) ? payload.projects : [];

    const clearCategories = db.prepare('DELETE FROM categories');
    const clearProjects = db.prepare('DELETE FROM projects');
    
    const insertCategory = db.prepare('INSERT INTO categories (id, title) VALUES (?, ?)');
    const insertProject = db.prepare('INSERT INTO projects (id, title, logo, isExternal, categoryId, blocks, sort_order, status, theme, accentColor, seoTitle, seoDesc, ogImage, externalUrl, featured, tagline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

    const transaction = db.transaction(() => {
        clearCategories.run();
        clearProjects.run();

        for (const [id, title] of Object.entries(categories)) {
            if (!id || !title) continue;
            insertCategory.run(String(id), String(title));
        }

        projects.forEach((proj, index) => {
            if (!proj?.id) return;
            insertProject.run(
                String(proj.id),
                String(proj.title || proj.id),
                proj.logo || null,
                proj.isExternal ? 1 : 0,
                proj.categoryId || null,
                JSON.stringify(Array.isArray(proj.blocks) ? proj.blocks : []),
                index,
                proj.status === 'draft' ? 'draft' : 'published',
                proj.theme || 'light',
                proj.accentColor || '#6b6b6b',
                proj.seoTitle || null,
                proj.seoDesc || null,
                proj.ogImage || null,
                proj.externalUrl || null,
                proj.featured ? 1 : 0,
                String(proj.tagline || '').trim() ? Array.from(String(proj.tagline).trim()).slice(0, 80).join('') : null
            );
        });
    });

    transaction();
}

function cleanText(value, limit = 240) {
    return String(value || '').trim().slice(0, limit) || null;
}

function safeJson(value) {
    try {
        return JSON.stringify(value && typeof value === 'object' ? value : {});
    } catch {
        return '{}';
    }
}

function parseJson(value) {
    try {
        const parsed = JSON.parse(value || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export function recordAnalyticsEvent(event) {
    if (!event || typeof event !== 'object') throw new Error('Invalid analytics event');

    const insert = db.prepare(`
        INSERT INTO analytics_events (
            ts, type, visitor_id, session_id, path, title, referrer,
            source, medium, campaign, country, region, city, timezone, language,
            device, browser, os, viewport, screen, dpr, connection, vpn_status,
            is_bot, duration, ip_hash, user_agent, metadata
        ) VALUES (
            @ts, @type, @visitor_id, @session_id, @path, @title, @referrer,
            @source, @medium, @campaign, @country, @region, @city, @timezone, @language,
            @device, @browser, @os, @viewport, @screen, @dpr, @connection, @vpn_status,
            @is_bot, @duration, @ip_hash, @user_agent, @metadata
        )
    `);

    insert.run({
        ts: event.ts || new Date().toISOString(),
        type: cleanText(event.type, 40) || 'event',
        visitor_id: cleanText(event.visitorId || event.visitor_id, 80),
        session_id: cleanText(event.sessionId || event.session_id, 80),
        path: cleanText(event.path, 320),
        title: cleanText(event.title, 320),
        referrer: cleanText(event.referrer, 500),
        source: cleanText(event.source, 120),
        medium: cleanText(event.medium, 120),
        campaign: cleanText(event.campaign, 160),
        country: cleanText(event.country, 80),
        region: cleanText(event.region, 120),
        city: cleanText(event.city, 120),
        timezone: cleanText(event.timezone, 120),
        language: cleanText(event.language, 80),
        device: cleanText(event.device, 60),
        browser: cleanText(event.browser, 80),
        os: cleanText(event.os, 80),
        viewport: cleanText(event.viewport, 40),
        screen: cleanText(event.screen, 40),
        dpr: Number.isFinite(Number(event.dpr)) ? Number(event.dpr) : null,
        connection: cleanText(event.connection, 80),
        vpn_status: cleanText(event.vpnStatus || event.vpn_status, 40) || 'unknown',
        is_bot: event.isBot || event.is_bot ? 1 : 0,
        duration: Number.isFinite(Number(event.duration)) ? Math.max(0, Math.round(Number(event.duration))) : 0,
        ip_hash: cleanText(event.ipHash || event.ip_hash, 128),
        user_agent: cleanText(event.userAgent || event.user_agent, 500),
        metadata: safeJson(event.metadata)
    });
}

function incrementMap(map, key, amount = 1) {
    const label = cleanText(key, 160) || 'unknown';
    map.set(label, (map.get(label) || 0) + amount);
}

function topList(map, limit = 8) {
    return Array.from(map.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
}

function referrerLabel(value) {
    if (!value) return 'direct';
    try {
        const url = new URL(value);
        if (/localhost|127\.0\.0\.1|alabspace\.com/i.test(url.hostname)) return 'internal';
        return url.hostname.replace(/^www\./, '');
    } catch {
        return 'direct';
    }
}

export function getAnalyticsSummary(days = 30) {
    const safeDays = Math.min(365, Math.max(1, Number(days) || 30));
    const now = new Date();
    const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - safeDays + 1));
    const from = fromDate.toISOString();

    // Боты в общую статистику не идут — иначе они разбавляют посещаемость
    // и портят все производные метрики. Их число отдаём отдельным полем.
    const rows = db.prepare('SELECT * FROM analytics_events WHERE ts >= ? AND is_bot = 0 ORDER BY ts ASC').all(from);
    const botEvents = db.prepare('SELECT COUNT(*) AS c FROM analytics_events WHERE ts >= ? AND is_bot = 1').get(from).c;
    const byDay = new Map();
    for (let i = 0; i < safeDays; i++) {
        const d = new Date(fromDate.getTime() + i * 86400000).toISOString().slice(0, 10);
        byDay.set(d, { date: d, pageviews: 0, sessions: new Set() });
    }

    const visitors = new Set();
    const sessions = new Set();
    const sessionPageviews = new Map();
    const sessionEvents = new Map();
    const sessionDurations = new Map();
    const topPages = new Map();
    const referrers = new Map();
    const countries = new Map();
    const devices = new Map();
    const browsers = new Map();
    const sections = new Map();
    const vpn = new Map();

    let pageviews = 0;
    let sectionViews = 0;
    let outboundClicks = 0;

    for (const row of rows) {
        const day = String(row.ts || '').slice(0, 10);
        const dayBucket = byDay.get(day);
        const metadata = parseJson(row.metadata);
        if (row.visitor_id) visitors.add(row.visitor_id);
        if (row.session_id) {
            sessions.add(row.session_id);
            if (dayBucket) dayBucket.sessions.add(row.session_id);
            sessionEvents.set(row.session_id, (sessionEvents.get(row.session_id) || 0) + 1);
        }

        if (row.type === 'pageview') {
            pageviews += 1;
            if (dayBucket) dayBucket.pageviews += 1;
            if (row.session_id) sessionPageviews.set(row.session_id, (sessionPageviews.get(row.session_id) || 0) + 1);
            incrementMap(topPages, row.path || '/');
            incrementMap(referrers, row.source || referrerLabel(row.referrer));
            incrementMap(countries, row.country || 'unknown');
            incrementMap(devices, row.device || 'unknown');
            incrementMap(browsers, row.browser || 'unknown');
            incrementMap(vpn, row.vpn_status || 'unknown');
        }

        if (row.type === 'section_view') {
            sectionViews += 1;
            incrementMap(sections, metadata.section || row.path || 'section');
        }

        if (row.type === 'outbound_click') outboundClicks += 1;

        if (row.type === 'engagement' && row.session_id) {
            sessionDurations.set(row.session_id, Math.max(sessionDurations.get(row.session_id) || 0, row.duration || 0));
        }
    }

    let bounced = 0;
    sessions.forEach(sessionId => {
        const pv = sessionPageviews.get(sessionId) || 0;
        const events = sessionEvents.get(sessionId) || 0;
        if (pv <= 1 && events <= 2) bounced += 1;
    });

    const avgDuration = sessionDurations.size
        ? Math.round(Array.from(sessionDurations.values()).reduce((sum, value) => sum + value, 0) / sessionDurations.size)
        : 0;

    const recent = db.prepare('SELECT ts, type, path, country, device, browser, duration, metadata FROM analytics_events ORDER BY ts DESC LIMIT 20')
        .all()
        .map(row => ({ ...row, metadata: parseJson(row.metadata) }));

    return {
        range: { days: safeDays, from, to: now.toISOString() },
        totals: {
            pageviews,
            visitors: visitors.size,
            sessions: sessions.size,
            sectionViews,
            outboundClicks,
            avgEngagementSeconds: Math.round(avgDuration / 1000),
            bounceRate: sessions.size ? Math.round((bounced / sessions.size) * 100) : 0,
            botEvents
        },
        timeSeries: Array.from(byDay.values()).map(day => ({
            date: day.date,
            pageviews: day.pageviews,
            sessions: day.sessions.size
        })),
        topPages: topList(topPages),
        referrers: topList(referrers),
        countries: topList(countries),
        devices: topList(devices),
        browsers: topList(browsers),
        sections: topList(sections),
        vpn: topList(vpn),
        recent
    };
}

export default db;
