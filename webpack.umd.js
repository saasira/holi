const config = require('./webpack.config.js');

module.exports = {
  ...config,
  output: {
    path: path.resolve(__dirname, 'dist/umd'),
    filename: 'holi.min.js',
    library: {
      name: 'Holi',
      type: 'umd'
    },
    globalObject: 'this',
    clean: true
  },
  externals: {
    jquery: 'jQuery'
  }
};
