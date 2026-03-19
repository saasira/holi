
class ContentProvider {
    static get name() {
        throw new Error('Subclasses must implement static name');
    }
    
    resolve(dataSourceExpr) {
        /**
         * Converts dataSource expression to renderable array
         * @param {string} dataSourceExpr - "@{patient.addresses}"
         * @returns {Array<{label: string, id?: string, contentUrl?: string}>}
         */
        throw new Error('Subclasses must implement resolve(dataSourceExpr)');
    }
    
    async getContent(itemData, index) {
        /**
         * Fetches content for single item (lazy loading)
         * @param {Object} itemData - {label, id, contentUrl, ...}
         * @param {number} index - Item index
         * @returns {Promise<string>} HTML content
         */
        throw new Error('Subclasses must implement getContent(itemData, index)');
    }
    
    // Optional hooks for advanced usage
    async init() {}
    destroy() {}
}

if (typeof window !== 'undefined') {
    window.ContentProvider = ContentProvider;
}

export { ContentProvider };
