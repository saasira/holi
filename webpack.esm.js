const config = require('./webpack.config.js');

module.exports = {
  ...config,
  output: {
    path: path.resolve(__dirname, 'dist/esm'),
    filename: 'index.js',
    library: {
      type: 'module'
    },
    clean: true
  },
  experiments: {
    outputModule: true
  }
};
