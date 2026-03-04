const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: 'examples/index.js',
  devServer: {
    port: 8080,
    inline:true,
    open: true,
    hot: true,              // Automatically refresh the page whenever bundle.js 
    publicPath: '/dist',
    contentBase: path.resolve(__dirname, "public")
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: 'examples/index.html'
    })
  ]
};
