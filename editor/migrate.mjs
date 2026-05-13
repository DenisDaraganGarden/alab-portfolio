import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveCases } from './db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const CASES_JSON = path.join(ROOT_DIR, 'public', 'data', 'cases.json');

try {
    console.log('[Migrate] Reading cases.json...');
    const data = fs.readFileSync(CASES_JSON, 'utf8');
    const payload = JSON.parse(data);

    console.log('[Migrate] Saving to SQLite...');
    saveCases(payload);
    console.log('[Migrate] Migration complete! Data is now in cms.db');
} catch (e) {
    console.error('[Migrate] Error migrating data:', e);
}
