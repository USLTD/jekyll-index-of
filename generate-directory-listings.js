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

const CONTENT_ROOT_REAL = fs.realpathSync(PUBLIC_DIR);

// Real paths of directories already listed. Real directories are only ever
// walked once, at their canonical path.
const visitedDirs = new Set();

// realpath -> canonical listing path (dirRel), used to resolve directory
// symlinks to the listing page of their target.
const realDirByPath = new Map([[CONTENT_ROOT_REAL, '']]);

// Directory symlinks whose target had not been walked when the link was
// encountered; resolved after the full walk.
const deferredDirSymlinks = [];

// Every inside-root directory symlink (containing dir -> target), used to
// detect cycles: Jekyll follows inside-source directory symlinks, so a cycle
// makes its reader recurse until the OS returns ELOOP and the build dies.
const dirSymlinkEdges = [];

// Symlinks that will crash the Jekyll build outright.
const buildBreakers = [];

function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Recognizes index.html pages previously written by this script, so that
// user-authored index.html files are never overwritten.
const GENERATED_PAGE_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
function isGeneratedPage(content) {
    const match = content.match(GENERATED_PAGE_RE);
    if (!match) return false;
    const frontMatter = match[1];
    const body = match[2];
    return frontMatter.includes('layout: directory')
        && frontMatter.includes('dir_path:')
        && body.trim() === '';
}

function isInsideDir(root, target) {
    const rel = path.relative(root, target);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function listOrder(a, b) {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name);
}

function realPathOf(target) {
    try {
        return fs.realpathSync(target);
    } catch (e) {
        return path.resolve(target);
    }
}

function processDir(dirAbs, dirRel, listing) {
    const realDir = realPathOf(dirAbs);
    realDirByPath.set(realDir, dirRel);
    if (visitedDirs.has(realDir)) return;
    visitedDirs.add(realDir);

    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    const current = [];

    for (const entry of entries) {
        if (IGNORE.has(entry.name)) continue;
        handleEntry(entry, dirAbs, dirRel, realDir, current, listing);
    }

    current.sort(listOrder);
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

    let existing = null;
    try {
        existing = fs.readFileSync(pagePath, 'utf8');
    } catch (e) {
        /* No index.html yet. */
    }

    if (existing === null || isGeneratedPage(existing)) {
        fs.writeFileSync(pagePath, frontMatter, 'utf8');
    } else {
        console.warn(`Preserving user-authored "${pagePath}" (not overwritten).`);
    }
}

function handleEntry(entry, dirAbs, dirRel, currentRealDir, current, listing) {
    const fullPath = path.join(dirAbs, entry.name);
    const displayPath = path.posix.join(dirRel, entry.name) || entry.name;

    let stat;
    const isSymlink = entry.isSymbolicLink();

    try {
        // Follows symlinks so entries are described by their target's type/size.
        stat = fs.statSync(fullPath);
    } catch (e) {
        try {
            // Broken or inaccessible symlink: describe the link itself.
            stat = fs.lstatSync(fullPath);
        } catch (e2) {
            console.warn(`Skipping unreadable entry "${fullPath}": ${e2.message}`);
            return;
        }
        if (stat.isSymbolicLink()) {
            // Broken symlinks would crash the Jekyll/GitHub Pages build outright
            // ("No such file or directory"), so keep them out of the listing and
            // tell the user exactly what to do.
            buildBreakers.push(`broken symlink "${displayPath}" (target does not exist)`);
            return;
        }
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
                bytes: stat.size,
                date: dateMod,
                isSymlink: isSymlink
            });
            return;
        }
    }

    if (stat.isDirectory()) {
        const realDir = realPathOf(fullPath);

        if (!isInsideDir(CONTENT_ROOT_REAL, realDir)) {
            // Never publish anything outside the content root (a symlink to / or
            // $HOME would otherwise drag the whole filesystem into the listing).
            console.warn(`Skipping "${displayPath}": symlink target is outside the content root.`);
            return;
        }

        if (isSymlink) {
            // Directory symlinks are never traversed: traversal caused infinite
            // recursion on circular links and conflicting index.html writes when
            // the same real directory was reachable via several paths. Instead,
            // the link is listed once and points at its target's canonical page.
            if (realDir === currentRealDir) {
                buildBreakers.push(`self-referential directory symlink "${displayPath}"`);
                return;
            }

            dirSymlinkEdges.push({ from: currentRealDir, to: realDir, displayPath: displayPath });

            const canonicalRel = realDirByPath.get(realDir);
            if (canonicalRel !== undefined) {
                current.push({
                    name: entry.name,
                    type: 'dir',
                    date: dateMod,
                    isSymlink: true,
                    canonicalRel: canonicalRel
                });
            } else {
                // Target not walked yet; resolve after the full walk.
                deferredDirSymlinks.push({
                    name: entry.name,
                    parentRel: dirRel,
                    realDir: realDir,
                    date: dateMod
                });
            }
            return;
        }

        current.push({
            name: entry.name,
            type: 'dir',
            date: dateMod,
            isSymlink: false
        });
        processDir(fullPath, path.posix.join(dirRel, entry.name), listing);
    } else {
        if (isSymlink && !isInsideDir(CONTENT_ROOT_REAL, realPathOf(fullPath))) {
            // Targets outside the content root are never published (GitHub Pages
            // safe mode drops them too), so do not list a link that would 404.
            console.warn(`Skipping "${displayPath}": symlink target is outside the content root.`);
            return;
        }
        current.push({
            name: entry.name,
            type: 'file',
            ext: ext,
            size: formatSize(stat.size),
            bytes: stat.size,
            date: dateMod,
            isSymlink: isSymlink,
            isHardlink: isHardlink
        });
    }
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

// Resolve directory symlinks whose canonical target was walked after the link.
for (const link of deferredDirSymlinks) {
    const canonicalRel = realDirByPath.get(link.realDir);
    if (canonicalRel === undefined) {
        console.warn(`Skipping "${path.posix.join(link.parentRel, link.name)}": symlink target is not listed inside the content root.`);
        continue;
    }
    if (!Array.isArray(listing[link.parentRel])) listing[link.parentRel] = [];
    listing[link.parentRel].push({
        name: link.name,
        type: 'dir',
        date: link.date,
        isSymlink: true,
        canonicalRel: canonicalRel
    });
    listing[link.parentRel].sort(listOrder);
}

// Detect cycles among inside-root directory symlinks. Jekyll follows these
// symlinks, so any cycle makes its reader recurse until ELOOP kills the build.
(function detectSymlinkCycles() {
    const adj = new Map();
    for (const edge of dirSymlinkEdges) {
        if (!adj.has(edge.from)) adj.set(edge.from, []);
        adj.get(edge.from).push(edge);
    }

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();

    function dfs(node) {
        color.set(node, GRAY);
        for (const edge of (adj.get(node) || [])) {
            const targetColor = color.get(edge.to) || WHITE;
            if (targetColor === GRAY) {
                buildBreakers.push(`circular directory symlink "${edge.displayPath}"`);
            } else if (targetColor === WHITE) {
                dfs(edge.to);
            }
        }
        color.set(node, BLACK);
    }

    for (const node of adj.keys()) {
        if ((color.get(node) || WHITE) === WHITE) dfs(node);
    }
})();

if (buildBreakers.length > 0) {
    console.warn('');
    console.warn(`! ${buildBreakers.length} problem symlink(s) in "${CONTENT_ROOT}/" that WILL crash the Jekyll build:`);
    for (const problem of buildBreakers) {
        console.warn(`  - ${problem}`);
    }
    console.warn('  Remove or repair them, otherwise the Jekyll/GitHub Pages build fails.');
}

fs.writeFileSync(DATA_FILE, JSON.stringify(listing, null, 2), 'utf8');
console.log(`Successfully generated _data/directory.json and populated index files for "${CONTENT_ROOT}/".`);
