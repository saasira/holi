const fs = require('fs');
const path = require('path');

const root = process.cwd();
const srcBase = path.join(root, 'src', 'examples');
const outBase = path.join(root, 'public', 'examples');

const srcPages = path.join(srcBase, 'pages');
const srcStyles = path.join(srcBase, 'styles');
const srcScripts = path.join(srcBase, 'scripts');
const srcApi = path.join(srcBase, 'api');

const outPages = path.join(outBase, 'pages');
const outStyles = path.join(outBase, 'styles');
const outScripts = path.join(outBase, 'scripts');
const outApi = path.join(outBase, 'api');

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function copyDirIfExists(from, to) {
    if (!fs.existsSync(from)) return;
    ensureDir(path.dirname(to));
    fs.cpSync(from, to, { recursive: true, force: true });
}

function relativePrefixFromPageDir(pageRelativeDir) {
    const dir = String(pageRelativeDir || '.');
    if (dir === '.' || dir === '') return '../';
    const depth = dir.split(/[\\/]+/).filter(Boolean).length;
    return '../'.repeat(depth + 1);
}

function rewritePageAssets(html, pageRelativeDir = '.') {
    let output = html;
    const prefix = relativePrefixFromPageDir(pageRelativeDir);
    const stylesPrefix = `${prefix}styles/`;
    const scriptsPrefix = `${prefix}scripts/`;

    // Core bundle references from page files -> dist assets
    output = output.replace(/(["'])\/holi\.js\1/g, '$1/dist/holi.js$1');
    output = output.replace(/(["'])\/holi\.css\1/g, '$1/dist/holi.css$1');

    // Local page-relative refs -> structured example folders
    output = output.replace(/(["'])\.\/([^"'\/]+\.css)\1/g, `$1${stylesPrefix}$2$1`);
    output = output.replace(/(["'])\.\/([^"'\/]+\.js)\1/g, `$1${scriptsPrefix}$2$1`);

    // Bare local refs without ./ prefix
    output = output.replace(/(["'])([^"'\/]+\.(css))\1/g, `$1${stylesPrefix}$2$1`);
    output = output.replace(/(["'])([^"'\/]+\.(js))\1/g, `$1${scriptsPrefix}$2$1`);

    return output;
}

function collectHtmlFiles(rootDir) {
    if (!fs.existsSync(rootDir)) return [];

    const files = [];
    const walk = (currentDir, baseDir) => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        entries.forEach((entry) => {
            const abs = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walk(abs, baseDir);
                return;
            }
            if (!entry.isFile() || !entry.name.endsWith('.html')) return;
            files.push(path.relative(baseDir, abs));
        });
    };

    walk(rootDir, rootDir);
    return files;
}

function buildExamples() {
    if (!fs.existsSync(srcBase)) {
        console.log('[examples] src/examples not found, skipping.');
        return;
    }

    fs.rmSync(outBase, { recursive: true, force: true });
    fs.rmSync(path.join(outBase, 'pages'), { recursive: true, force: true });
    ensureDir(outPages);
    ensureDir(outStyles);
    ensureDir(outScripts);
    ensureDir(outApi);

    copyDirIfExists(srcStyles, outStyles);
    copyDirIfExists(srcScripts, outScripts);
    copyDirIfExists(srcApi, outApi);

    if (fs.existsSync(srcPages)) {
        const pages = collectHtmlFiles(srcPages);

        pages.forEach((relativeFile) => {
            const from = path.join(srcPages, relativeFile);
            const to = path.join(outPages, relativeFile);
            ensureDir(path.dirname(to));
            const raw = fs.readFileSync(from, 'utf8');
            const transformed = rewritePageAssets(raw, path.dirname(relativeFile));
            fs.writeFileSync(to, transformed, 'utf8');
        });
    }

    console.log('[examples] built to public/examples');
}

buildExamples();
