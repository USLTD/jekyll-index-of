const fs = require('fs');
const path = require('path');

function normalizeContentRoot(rawValue) {
    const normalized = String(rawValue || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '');

    if (!normalized) return 'public';
    if (normalized.includes('..')) {
        throw new Error(`Invalid content root "${rawValue}": parent directory segments are not allowed.`);
    }

    return normalized;
}

function resolveContentRoot() {
    if (process.env.CONTENT_ROOT) {
        return normalizeContentRoot(process.env.CONTENT_ROOT);
    }

    const configPath = path.join(__dirname, '_config.yml');
    if (fs.existsSync(configPath)) {
        const config = fs.readFileSync(configPath, 'utf8');
        const match = config.match(/^\s*content_root:\s*["']?([^"'\n#]+)["']?/m);
        if (match && match[1]) {
            return normalizeContentRoot(match[1]);
        }
    }

    return 'public';
}

const CONTENT_ROOT = resolveContentRoot();
const PUBLIC_DIR = path.join(__dirname, CONTENT_ROOT);
const DATA_FILE  = path.join(__dirname, '_data', 'directory.json');
const IGNORE     = new Set(['.git', '.gitkeep', 'index.html', '.DS_Store']);

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function processDir(dirAbs, dirRel, listing) {
    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    const current = [];

    for (const entry of entries) {
        if (IGNORE.has(entry.name)) continue;
        const fullPath = path.join(dirAbs, entry.name);
        
        let stat;
        const isSymlink = entry.isSymbolicLink();
        
        try {
            stat = isSymlink ? fs.statSync(fullPath) : fs.statSync(fullPath);
        } catch (e) {
            stat = fs.lstatSync(fullPath);
        }

        const ext = path.extname(entry.name).toLowerCase().replace('.', '');
        const dateMod = stat.mtime ? stat.mtime.toISOString().split('T')[0] : '';
        const isHardlink = !stat.isDirectory() && stat.nlink > 1;

        if (!stat.isDirectory() && ext === 'url') {
            const content = fs.readFileSync(fullPath, 'utf8');
            let targetUrl = '';
            
            const match = content.match(/^URL=(.+)$/im);
            if (match) {
                targetUrl = match[1].trim();
            } else if (content.startsWith('http')) {
                targetUrl = content.trim();
            }
            
            if (targetUrl) {
                current.push({
                    name: entry.name,
                    type: 'url',
                    ext: 'url',
                    target: targetUrl,
                    size: formatSize(stat.size),
                    date: dateMod,
                    isSymlink: isSymlink
                });
                continue;
            }
        }

        if (stat.isDirectory()) {
            current.push({ 
                name: entry.name, 
                type: 'dir',
                date: dateMod,
                isSymlink: isSymlink 
            });
            processDir(fullPath, path.posix.join(dirRel, entry.name), listing);
        } else {
            current.push({
                name: entry.name,
                type: 'file',
                ext: ext,
                size: formatSize(stat.size),
                date: dateMod,
                isSymlink: isSymlink,
                isHardlink: isHardlink
            });
        }
    }

    current.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
    });

    listing[dirRel] = current;

    // Generate Jekyll index.html
    const pagePath = path.join(PUBLIC_DIR, ...dirRel.split('/').filter(Boolean), 'index.html');
    const yamlSafeDirRel = dirRel.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const yamlSafeContentRoot = CONTENT_ROOT.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const frontMatter = [
        '---',
        `layout: directory`,
        `content_root: "${yamlSafeContentRoot}"`,
        `dir_path: "${yamlSafeDirRel}"`,
        '---'
    ].join('\n');

    const pageDir = path.dirname(pagePath);
    if (!fs.existsSync(pageDir)) fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(pagePath, frontMatter, 'utf8');
}

if (!fs.existsSync(PUBLIC_DIR)) {
    console.error(`"${CONTENT_ROOT}/" directory not found!`);
    process.exit(1);
}

if (!fs.existsSync(path.dirname(DATA_FILE))) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

const listing = {};
processDir(PUBLIC_DIR, '', listing);

fs.writeFileSync(DATA_FILE, JSON.stringify(listing, null, 2), 'utf8');
console.log(`Successfully generated _data/directory.json and populated index files for "${CONTENT_ROOT}/".`);
