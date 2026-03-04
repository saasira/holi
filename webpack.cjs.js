const config = require('./webpack.config.js');

module.exports = {
  ...config,
  output: {
    path: path.resolve(__dirname, 'dist/cjs'),
    filename: 'index.js',
    library: {
      type: 'commonjs2'
    },
    clean: true
  }
};
