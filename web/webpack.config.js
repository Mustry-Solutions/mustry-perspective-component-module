const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

// Bundle names — the gateway serves them at /res/mustry-components/<name>.js (and
// .css). Must line up with BROWSER_RESOURCES and TOAST_RESOURCES in the common
// Java module class. MustryToasts is a small separate bundle because the gateway
// adds it to every page (toasts need no component), unlike the component bundle.
const LibName = 'MustryComponents';
const ToastLibName = 'MustryToasts';

// Mode comes from the CLI (--mode production|development, see package.json scripts).
// Production is what ships in the .modl: minified, no source maps.
module.exports = (env, argv) => ({
    entry: {
        [LibName]: path.join(__dirname, 'typescript/index.ts'),
        [ToastLibName]: path.join(__dirname, 'typescript/toast/index.ts')
    },
    output: {
        // webpack writes straight into the Gradle resources dir for this subproject.
        path: path.resolve(__dirname, 'build/generated-resources/mounted'),
        filename: '[name].js',
        library: '[name]',
        libraryTarget: 'umd',
        umdNamedDefine: true,
        clean: true
    },
    devtool: argv.mode === 'development' ? 'source-map' : false,
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'],
        fallback: {
            // react-markdown@4's vfile dependency requires Node's `path`;
            // webpack 5 stopped polyfilling Node builtins automatically.
            path: require.resolve('path-browserify')
        }
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: { loader: 'ts-loader' },
                exclude: /node_modules/
            },
            {
                test: /\.s?css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    { loader: 'css-loader', options: { url: false } },
                    { loader: 'sass-loader' }
                ]
            }
        ]
    },
    plugins: [
        new MiniCssExtractPlugin({ filename: '[name].css' }),
        // react-markdown@4's vfile dependency also calls process.cwd() at
        // runtime; webpack 5 no longer injects the process shim itself.
        new webpack.ProvidePlugin({ process: 'process/browser' })
    ],
    optimization: {
        // '...' keeps webpack's default JS minimizer (terser); CssMinimizerPlugin
        // covers the extracted stylesheet, which production mode alone leaves as-is.
        minimizer: ['...', new CssMinimizerPlugin()]
    },
    // These are provided globally by the Perspective runtime, so don't bundle them.
    externals: {
        'react': 'React',
        'react-dom': 'ReactDOM',
        'mobx': 'mobx',
        'mobx-react': 'mobxReact',
        '@inductiveautomation/perspective-client': 'PerspectiveClient'
    }
});
