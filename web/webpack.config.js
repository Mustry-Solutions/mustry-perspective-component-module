const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

// Bundle name — the gateway serves this at /res/mustry-components/MustryComponents.js
// (and .css). Must line up with BROWSER_RESOURCES in the common Java module class.
const LibName = 'MustryComponents';

module.exports = {
    entry: {
        [LibName]: path.join(__dirname, 'typescript/index.ts')
    },
    output: {
        // webpack writes straight into the Gradle resources dir for this subproject.
        path: path.resolve(__dirname, 'build/generated-resources/mounted'),
        filename: `${LibName}.js`,
        library: [LibName],
        libraryTarget: 'umd',
        umdNamedDefine: true,
        clean: true
    },
    devtool: 'source-map',
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss']
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
        new MiniCssExtractPlugin({ filename: `${LibName}.css` })
    ],
    // These are provided globally by the Perspective runtime, so don't bundle them.
    externals: {
        'react': 'React',
        'react-dom': 'ReactDOM',
        'mobx': 'mobx',
        'mobx-react': 'mobxReact',
        '@inductiveautomation/perspective-client': 'PerspectiveClient'
    }
};
