// Dev preview of the canvas idle modes (see guard-preview/preview.ts). Not shipped.
const path = require('path');

module.exports = {
    mode: 'development',
    devtool: 'source-map',
    entry: { preview: path.join(__dirname, 'guard-preview/preview.ts') },
    output: { path: path.resolve(__dirname, 'build/guard-preview'), filename: '[name].js', clean: true },
    resolve: { extensions: ['.ts', '.js'] },
    module: { rules: [{ test: /\.ts$/, use: { loader: 'ts-loader', options: { onlyCompileBundledFiles: true } }, exclude: /node_modules/ }] },
    plugins: [{
        apply: (compiler) => compiler.hooks.afterEmit.tap('copy-html', () => {
            require('fs').copyFileSync(path.join(__dirname, 'guard-preview/index.html'), path.join(__dirname, 'build/guard-preview/index.html'));
        })
    }]
};
