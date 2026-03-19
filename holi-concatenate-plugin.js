const ConcatenateFilesPlugin = require('webpack-concat-plugin');

module.exports = class HoliConcatenatePlugin {
    constructor(options) {
        this.options = options;
    }
    
    apply(compiler) {
        compiler.hooks.thisCompilation.tap('HoliConcatenatePlugin', (compilation) => {
            compilation.hooks.processAssets.tapPromise(
                {
                    name: 'HoliConcatenatePlugin',
                    stage: compilation.constructor.PROCESS_ASSETS_STAGE_ADDITIONAL
                },
                async () => {
                    const files = this.options.include.map(glob => 
                        glob.sync(this.options.include)
                    ).flat();
                    
                    let content = this.options.header || '';
                    for (const file of files) {
                        content += await this.readFile(file) + '\n\n';
                    }
                    content += this.options.footer || '';
                    
                    compilation.emitAsset(
                        this.options.output.name,
                        new compilation.compiler.webpack.sources.RawSource(content)
                    );
                }
            );
        });
    }
    
    async readFile(filePath) {
        const fs = require('fs').promises;
        return await fs.readFile(filePath, 'utf8');
    }
};
