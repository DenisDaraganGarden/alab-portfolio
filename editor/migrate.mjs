/**
 * Разовый импорт public/data/cases.json в SQLite.
 *
 * ОСТОРОЖНО: saveCases полностью перезаписывает содержимое базы. В cases.json
 * попадают только опубликованные проекты, поэтому запуск без разбора
 * безвозвратно уничтожает все черновики. Раньше скрипт делал это молча и
 * завершался с кодом 0 — теперь требует явного подтверждения и делает бэкап.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveCases, getCases, backupDb } from './db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const CASES_JSON = path.join(ROOT_DIR, 'public', 'data', 'cases.json');
const force = process.argv.includes('--force');

try {
    console.log('[Migrate] Читаю cases.json...');
    const payload = JSON.parse(fs.readFileSync(CASES_JSON, 'utf8'));
    const incoming = Array.isArray(payload.projects) ? payload.projects : [];

    const current = getCases();
    const existing = current.projects || [];
    const drafts = existing.filter(project => project.status === 'draft');

    console.log(`[Migrate] Сейчас в базе: ${existing.length} проектов (черновиков: ${drafts.length})`);
    console.log(`[Migrate] В cases.json: ${incoming.length} проектов`);

    if (!force) {
        console.error('');
        console.error('[Migrate] ОСТАНОВЛЕНО. Импорт полностью заменит содержимое базы.');
        if (drafts.length) {
            console.error(`[Migrate] Будут безвозвратно удалены черновики: ${drafts.map(d => d.id).join(', ')}`);
        }
        console.error('[Migrate] Если это действительно нужно, запустите: node editor/migrate.mjs --force');
        process.exitCode = 1;
    } else {
        backupDb('pre-migrate');
        console.log('[Migrate] Записываю в SQLite...');
        saveCases(payload);
        console.log('[Migrate] Готово: данные в cms.db');
    }
} catch (e) {
    console.error('[Migrate] Ошибка импорта:', e);
    process.exitCode = 1;
}
