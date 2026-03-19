const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function exists(filePath) {
    return fs.existsSync(filePath);
}

function fail(message) {
    console.error(`[smoke] FAIL: ${message}`);
    process.exitCode = 1;
}

function pass(message) {
    console.log(`[smoke] PASS: ${message}`);
}

function assert(condition, message) {
    if (condition) {
        pass(message);
        return;
    }
    fail(message);
}

const sourceChecks = [
    {
        file: 'src/examples/pages/layout.html',
        patterns: ['<layout>', '<block>', '<region']
    },
    {
        file: 'src/examples/pages/gallery.html',
        patterns: ['component="gallery"', 'data-full-src=', 'source="/examples/api/gallery.json"']
    },
    {
        file: 'src/examples/pages/menubar.html',
        patterns: ['component="menubar"', 'role="menubar"', '<menubar']
    },
    {
        file: 'src/examples/pages/tree.html',
        patterns: ['component="tree"', 'role="tree"', '<tree']
    },
    {
        file: 'src/examples/pages/treepanel.html',
        patterns: ['component="treepanel"', 'role="treepanel"', '<treepanel']
    },
    {
        file: 'src/examples/pages/lifecycle-regression.html',
        patterns: ['component="gallery"', 'component="tree"', 'component="treepanel"']
    },
    {
        file: 'src/examples/pages/breadcrumbs.html',
        patterns: ['component="breadcrumbs"', 'role="breadcrumbs"', '<breadcrumbs']
    },
    {
        file: 'src/examples/pages/backtotop.html',
        patterns: ['component="backtotop"', 'role="backtotop"', '<backtotop']
    },
    {
        file: 'src/examples/pages/page-layout.html',
        patterns: ['<page layout="3x9"', 'layouts-base="/examples/layouts/"', '<block name="head">', '<block name="tail">', '<region name="styles">', '<block name="main"', '<region name="middle"']
    },
    {
        file: 'src/examples/layouts/3x9.html',
        patterns: ['data-layout="3x9"', '<layout-head', '<tail', '<slot name="styles"></slot>', '<slot name="header">', '<slot name="middle">']
    }
];

const builtChecks = [
    'public/examples/pages/layout.html',
    'public/examples/pages/gallery.html',
    'public/examples/pages/menubar.html',
    'public/examples/pages/tree.html',
    'public/examples/pages/treepanel.html',
    'public/examples/pages/lifecycle-regression.html',
    'public/examples/pages/breadcrumbs.html',
    'public/examples/pages/backtotop.html',
    'public/examples/pages/page-layout.html'
];

const builtAssetPatterns = [
    /(["'])\/dist\/holi\.js\1/,
    /(["'])\/dist\/holi\.css\1/
];

function runSourceChecks() {
    sourceChecks.forEach(({ file, patterns }) => {
        const abs = path.join(root, file);
        assert(exists(abs), `${file} exists`);
        if (!exists(abs)) return;

        const content = read(abs);
        patterns.forEach((pattern) => {
            assert(content.includes(pattern), `${file} contains ${pattern}`);
        });
    });
}

function runBuiltChecks() {
    builtChecks.forEach((file) => {
        const abs = path.join(root, file);
        assert(exists(abs), `${file} exists`);
        if (!exists(abs)) return;

        const content = read(abs);
        builtAssetPatterns.forEach((regex) => {
            assert(regex.test(content), `${file} references dist bundle assets`);
        });
    });

    const lifecycleBuilt = path.join(root, 'public/examples/pages/lifecycle-regression.html');
    if (exists(lifecycleBuilt)) {
        const content = read(lifecycleBuilt);
        assert(content.includes('../styles/lifecycle-regression.css'), 'lifecycle regression built page rewrote css path');
        assert(content.includes('../scripts/lifecycle-regression.js'), 'lifecycle regression built page rewrote js path');
    }

    const builtLayout = path.join(root, 'public/examples/layouts/3x9.html');
    assert(exists(builtLayout), 'public/examples/layouts/3x9.html exists');
    if (exists(builtLayout)) {
        const content = read(builtLayout);
        assert(content.includes('data-layout="3x9"'), 'public/examples/layouts/3x9.html preserves the layout contract');
        assert(content.includes('data-layout-head="true"'), 'public/examples/layouts/3x9.html preserves the layout head container');
        assert(content.includes('data-layout-tail="true"'), 'public/examples/layouts/3x9.html preserves the layout tail container');
    }
}

runSourceChecks();
runBuiltChecks();

if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
}

console.log('[smoke] All example smoke checks completed.');
