import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexPath = path.join(__dirname, 'index.html');
const htmlContent = fs.readFileSync(indexPath, 'utf-8');

const templateRegex = /<template\s+id="tmpl-([^"]+)">([\s\S]*?)<\/template>/g;

let match;
const templates = {};

while ((match = templateRegex.exec(htmlContent)) !== null) {
  const caseId = match[1];
  const templateContent = match[2].trim();
  templates[caseId] = templateContent;
}

const projectsData = {
    development: [
        { id: 'domm', title: 'Девелопмент / DOMM', logo: '/images/DOMM/logo-black.svg', isExternal: false },
        { id: 'l-buro', title: 'Ландшафтная архитектура / L.BURO', isExternal: false },
        { id: 'grani', title: 'Девелопмент / Грани', isExternal: false }
    ],
    services: [
        { id: 'princip32', title: 'Медицина / Принцип 32', isExternal: false },
        { id: 'tut', title: 'Сервисы / TUT', isExternal: false }
    ],
    production: [
        { id: 'aquadolce', title: 'FMCG / AquaDolce', isExternal: false },
        { id: 'kukis', title: 'FMCG / KUKIS', isExternal: false },
        { id: 'verde', title: 'Эко-технологии / VERDE', isExternal: false },
        { id: 'neft', title: 'Бренд / НЕФТЬ', isExternal: false }
    ]
};

const finalData = {
    categories: {
        development: 'Девелопмент и Архитектура',
        services: 'Услуги',
        production: 'Производство'
    },
    projects: []
};

for (const [category, projects] of Object.entries(projectsData)) {
    for (const proj of projects) {
        const fullProj = {
            ...proj,
            categoryId: category,
            blocks: []
        };
        if (templates[proj.id]) {
             fullProj.blocks.push({
                 type: 'raw_html',
                 content: templates[proj.id]
             });
        }
        finalData.projects.push(fullProj);
    }
}

const dataDir = path.join(__dirname, 'public', 'data');
if (!fs.existsSync(dataDir)){
    fs.mkdirSync(dataDir, { recursive: true });
}

fs.writeFileSync(path.join(dataDir, 'cases.json'), JSON.stringify(finalData, null, 2), 'utf-8');
console.log('Successfully generated public/data/cases.json');
