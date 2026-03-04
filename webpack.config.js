const path = require('path');
const glob = require('glob');
const fs = require('fs');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

let salesCache = null;
let treeCache = null;
let treeDetailsCache = null;

const readSalesPayload = () => {
    if (salesCache) return salesCache;
    const candidates = [
        path.resolve(__dirname, 'src/examples/api/sales.json'),
        path.resolve(__dirname, 'src/examples/api/sales'),
        path.resolve(__dirname, 'public/examples/api/sales.json'),
        path.resolve(__dirname, 'public/examples/api/sales')
    ];

    for (let i = 0; i < candidates.length; i += 1) {
        const filePath = candidates[i];
        if (!fs.existsSync(filePath)) continue;
        const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
        salesCache = JSON.parse(raw);
        return salesCache;
    }

    return { rows: [], headers: [], visibleFields: [] };
};

const readTreePayload = () => {
    if (treeCache) return treeCache;
    const candidates = [
        path.resolve(__dirname, 'src/examples/api/tree.json'),
        path.resolve(__dirname, 'src/examples/api/tree'),
        path.resolve(__dirname, 'public/examples/api/tree.json'),
        path.resolve(__dirname, 'public/examples/api/tree')
    ];

    for (let i = 0; i < candidates.length; i += 1) {
        const filePath = candidates[i];
        if (!fs.existsSync(filePath)) continue;
        const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
        treeCache = JSON.parse(raw);
        return treeCache;
    }

    return { nodesByParent: {} };
};

const readTreeDetailsPayload = () => {
    if (treeDetailsCache) return treeDetailsCache;
    const candidates = [
        path.resolve(__dirname, 'src/examples/api/tree-details.json'),
        path.resolve(__dirname, 'src/examples/api/tree-details'),
        path.resolve(__dirname, 'public/examples/api/tree-details.json'),
        path.resolve(__dirname, 'public/examples/api/tree-details')
    ];

    for (let i = 0; i < candidates.length; i += 1) {
        const filePath = candidates[i];
        if (!fs.existsSync(filePath)) continue;
        const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
        treeDetailsCache = JSON.parse(raw);
        return treeDetailsCache;
    }

    return { nodes: {} };
};

const buildTreeDetailsResponse = (query = {}) => {
    const payload = readTreeDetailsPayload();
    const nodes = payload && typeof payload.nodes === 'object' ? payload.nodes : {};
    const id = String(query.node || query.id || '').trim();
    const detail = nodes[id] || {
        title: id || 'Node',
        fields: { id, status: 'No detail payload found' },
        columns: ['field', 'value'],
        rows: Object.entries({ id, status: 'No detail payload found' }).map(([field, value]) => ({ field, value }))
    };

    return { id, detail };
};

const readRequestJson = (req) => {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => {
            raw += String(chunk || '');
        });
        req.on('end', () => {
            if (!raw.trim()) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', (error) => reject(error));
    });
};

const upsertTreeDetail = (payload = {}) => {
    const detailsPayload = readTreeDetailsPayload();
    if (!detailsPayload.nodes || typeof detailsPayload.nodes !== 'object') {
        detailsPayload.nodes = {};
    }

    const id = String(payload.id || payload.node || payload.nodeId || '').trim();
    if (!id) {
        throw new Error('Missing detail id');
    }

    const sourceDetail = payload.detail && typeof payload.detail === 'object'
        ? payload.detail
        : payload;

    const current = detailsPayload.nodes[id] && typeof detailsPayload.nodes[id] === 'object'
        ? detailsPayload.nodes[id]
        : {};

    const merged = {
        ...current,
        ...sourceDetail,
        title: String(
            sourceDetail.title
            || current.title
            || payload.label
            || id
        )
    };

    detailsPayload.nodes[id] = merged;
    treeDetailsCache = detailsPayload;
    return { id, detail: merged };
};

const buildTreeResponse = (query = {}) => {
    const payload = readTreePayload();
    const nodesByParent = payload && typeof payload.nodesByParent === 'object'
        ? payload.nodesByParent
        : {};

    const parent = String(query.parent || 'root').trim() || 'root';
    const nodes = Array.isArray(nodesByParent[parent]) ? nodesByParent[parent] : [];

    return {
        parent,
        count: nodes.length,
        nodes
    };
};

const toComparable = (value) => {
    if (value == null) return '';
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
    return String(value).toLowerCase();
};

const buildSalesResponse = (query = {}) => {
    const payload = readSalesPayload();
    const baseRows = Array.isArray(payload.rows) ? payload.rows : [];
    const headers = Array.isArray(payload.headers) ? payload.headers : [];
    const visibleFields = Array.isArray(payload.visibleFields) ? payload.visibleFields : [];

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 25);
    const q = String(query.q || '').trim().toLowerCase();
    const sortRaw = String(query.sort || '');
    const [sortField, sortDirRaw] = sortRaw.split(',');
    const sortDir = String(sortDirRaw || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

    const reserved = new Set(['page', 'limit', 'q', 'sort']);
    let rows = [...baseRows];

    Object.keys(query).forEach((key) => {
        if (reserved.has(key)) return;
        const expected = String(query[key] || '').trim().toLowerCase();
        if (!expected || expected === 'all') return;
        rows = rows.filter((row) => String(row?.[key] ?? '').toLowerCase() === expected);
    });

    if (q) {
        rows = rows.filter((row) => {
            return Object.values(row || {}).some((value) => String(value ?? '').toLowerCase().includes(q));
        });
    }

    if (sortField) {
        const direction = sortDir === 'desc' ? -1 : 1;
        rows.sort((a, b) => {
            const av = toComparable(a?.[sortField]);
            const bv = toComparable(b?.[sortField]);
            if (av < bv) return -1 * direction;
            if (av > bv) return 1 * direction;
            return 0;
        });
    }

    const totalCount = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const sliced = rows.slice(start, start + limit);

    return {
        rows: sliced,
        headers,
        visibleFields,
        totalCount,
        totalPages,
        page: safePage,
        limit
    };
};

const upsertSalesRow = (payload = {}) => {
    const data = readSalesPayload();
    if (!Array.isArray(data.rows)) data.rows = [];

    const row = payload.row && typeof payload.row === 'object' ? payload.row : payload;
    const key = String(payload.idField || 'id');
    let id = row?.[key];
    if (id == null || id === '') id = payload.id;

    if (id == null || id === '') {
        let max = 0;
        data.rows.forEach((item) => {
            const num = Number(item?.[key]);
            if (!Number.isNaN(num)) max = Math.max(max, num);
        });
        id = max + 1;
    }

    const nextRow = { ...row, [key]: id };
    const idx = data.rows.findIndex((item) => String(item?.[key]) === String(id));
    if (idx >= 0) {
        data.rows[idx] = nextRow;
    } else {
        data.rows.unshift(nextRow);
    }

    salesCache = data;
    return nextRow;
};

module.exports = {
    mode: 'production',
    cache: false,
    entry: './src/scripts/index.js', // Single entry bundles ALL JS
    
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'holi.js',
        publicPath: '/dist/',
        clean: true
    },

    devServer: {
        static: {
            directory: path.resolve(__dirname, 'public')
        },
        devMiddleware: {
            writeToDisk: true
        },
        port: 8080,
        setupMiddlewares(middlewares, devServer) {
            if (!devServer || !devServer.app) return middlewares;

            const serveSales = (req, res) => {
                try {
                    const response = buildSalesResponse(req.query || {});
                    res.setHeader('Content-Type', 'application/json');
                    res.status(200).send(JSON.stringify(response));
                } catch (error) {
                    res.status(500).json({ error: 'Failed to build sales response', details: String(error.message || error) });
                }
            };

            const saveSales = async (req, res) => {
                try {
                    const body = await readRequestJson(req);
                    const saved = upsertSalesRow(body);
                    res.setHeader('Content-Type', 'application/json');
                    res.status(200).send(JSON.stringify({
                        saved: true,
                        row: saved
                    }));
                } catch (error) {
                    res.status(400).json({
                        saved: false,
                        error: 'Failed to save sales row',
                        details: String(error.message || error)
                    });
                }
            };

            const serveTree = (req, res) => {
                try {
                    const response = buildTreeResponse(req.query || {});
                    res.setHeader('Content-Type', 'application/json');
                    res.status(200).send(JSON.stringify(response));
                } catch (error) {
                    res.status(500).json({ error: 'Failed to build tree response', details: String(error.message || error) });
                }
            };

            const serveTreeDetails = (req, res) => {
                try {
                    const response = buildTreeDetailsResponse(req.query || {});
                    res.setHeader('Content-Type', 'application/json');
                    res.status(200).send(JSON.stringify(response));
                } catch (error) {
                    res.status(500).json({ error: 'Failed to build tree details response', details: String(error.message || error) });
                }
            };

            const saveTreeDetails = async (req, res) => {
                try {
                    const body = await readRequestJson(req);
                    const query = req.query || {};
                    const payload = {
                        ...body,
                        id: body.id || query.id || query.node || ''
                    };
                    const response = upsertTreeDetail(payload);
                    res.setHeader('Content-Type', 'application/json');
                    res.status(200).send(JSON.stringify({
                        saved: true,
                        ...response
                    }));
                } catch (error) {
                    res.status(400).json({
                        saved: false,
                        error: 'Failed to save tree details',
                        details: String(error.message || error)
                    });
                }
            };

            devServer.app.get('/examples/api/sales', serveSales);
            devServer.app.get('/api/sales', serveSales);
            devServer.app.post('/examples/api/sales', saveSales);
            devServer.app.post('/api/sales', saveSales);
            devServer.app.put('/examples/api/sales', saveSales);
            devServer.app.put('/api/sales', saveSales);
            devServer.app.get('/examples/api/tree', serveTree);
            devServer.app.get('/api/tree', serveTree);
            devServer.app.get('/examples/api/tree-details', serveTreeDetails);
            devServer.app.get('/api/tree-details', serveTreeDetails);
            devServer.app.put('/examples/api/tree-details', saveTreeDetails);
            devServer.app.put('/api/tree-details', saveTreeDetails);
            devServer.app.post('/examples/api/tree-details', saveTreeDetails);
            devServer.app.post('/api/tree-details', saveTreeDetails);

            return middlewares;
        }
    },

    module: {
        rules: [
            // JS
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            },
            
            // CSS → holi.css
            {
                test: /\.css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader'
                ]
            }
        ]
    },

    plugins: [
        // CSS bundle
        new MiniCssExtractPlugin({
            filename: 'holi.css'
        }),

        // HTML templates → single holi.html (CORRECTED)
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'src/templates',
                    to: 'holi.html',
                    transform(content, absoluteFrom) {
                        // Concatenate ALL templates into one file
                        const allTemplates = glob.sync('src/templates/**/*.html');
                        
                        let bundledHtml = '<!-- Holi Template Library v1.0.0 -->\n';
                        allTemplates.forEach(templatePath => {
                            const templateName = path.basename(templatePath);
                            const templateContent = fs.readFileSync(templatePath, 'utf8');
                            
                            bundledHtml += `\n<!-- Template: ${templateName} ${templatePath} -->\n`;
                            bundledHtml += templateContent.trim() + '\n\n';
                        });
                        
                        bundledHtml += '<!-- End Holi Templates -->';
                        return bundledHtml;
                    },
                    noErrorOnMissing: true
                }
            ]
        })
    ],

    resolve: {
        alias: {
            //'@components': path.resolve(__dirname, 'src/scripts/components'),
            '@scripts': path.resolve(__dirname, 'src/scripts'),
            '@styles': path.resolve(__dirname, 'src/styles'),
            '@templates': path.resolve(__dirname, 'src/templates')
        }
    }
};
