import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// DB stored in editor directory
const dbPath = path.join(__dirname, 'cms.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

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
`);

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
        blocks: JSON.parse(row.blocks)
    }));

    return { categories, projects };
}

export function saveCases(payload) {
    const { categories, projects } = payload;

    const clearCategories = db.prepare('DELETE FROM categories');
    const clearProjects = db.prepare('DELETE FROM projects');
    
    const insertCategory = db.prepare('INSERT INTO categories (id, title) VALUES (?, ?)');
    const insertProject = db.prepare('INSERT INTO projects (id, title, logo, isExternal, categoryId, blocks, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');

    const transaction = db.transaction(() => {
        clearCategories.run();
        clearProjects.run();

        if (categories) {
            for (const [id, title] of Object.entries(categories)) {
                insertCategory.run(id, title);
            }
        }

        if (projects && Array.isArray(projects)) {
            projects.forEach((proj, index) => {
                insertProject.run(
                    proj.id,
                    proj.title,
                    proj.logo || null,
                    proj.isExternal ? 1 : 0,
                    proj.categoryId || null,
                    JSON.stringify(proj.blocks || []),
                    index // preserve the array order
                );
            });
        }
    });

    transaction();
}

export default db;
