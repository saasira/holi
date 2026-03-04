
HTTP = {
    Method: {
        POST: 'POST',
        PUT: 'PUT',
        GET: 'GET',
        DELETE: 'DELETE',
        HEAD: 'HEAD',
        OPTIONS: 'OPTIONS'
    },
    
    // Content-Type shorthand mappings
    CONTENT_TYPES: {
        'json': 'application/json',
        'form': 'application/x-www-form-urlencoded',
        'encoded': 'application/x-www-form-urlencoded',
        'multipart': 'multipart/form-data',
        'text': 'text/plain',
        'html': 'text/html',
        'xml': 'application/xml',
        'octet': 'application/octet-stream'
    },

    // Builder class for fluent API
    RequestBuilder: function(reqid) {
        this.endpoint = null;
        this.method = null;
        this.success = null;
        this.failure = null;
        this.progress = null;
        this.data = null;
        this.headers = null;
        this.blocking = false;
        this.reqid = reqid;

        // Fluent setters
        this.to = function(endpoint) {
            this.endpoint = endpoint;
            return this;
        };

        this.method = function(method) {
            this.method = method;
            return this;
        };

        this.post = function() {
            this.method = HTTP.Method.POST;
            return this;
        };

        this.put = function() {
            this.method = HTTP.Method.PUT;
            return this;
        };

        this.get = function() {
            this.method = HTTP.Method.GET;
            return this;
        };

        this.delete = function() {
            this.method = HTTP.Method.DELETE;
            return this;
        };

        this.withData = function(data) {
            if (!data || (Array.isArray(data) && data.length === 0)) {
                return this; // Skip empty data gracefully
            }
            this.data = data;
            return this;
        };

        this.withHeaders = function(headers) {
            this.headers = headers || {};
            return this;
        };

        this.withLoader = function(loader) {
            this.loader = loader || null;
            return this;
        };
        
        // New utility: Shorthand content-type mapping
        this.withContentType = function(type) {
            const mappedType = HTTP.CONTENT_TYPES[type.toLowerCase()] || type;
            this.headers = this.headers || {};
            this.headers['Content-Type'] = mappedType;
            return this;
        };

        this.onSuccess = function(callback) {
            this.success = callback;
            return this;
        };

        this.onFailure = function(callback) {
            this.failure = callback;
            return this;
        };

        this.onProgress = function(callback) {
            this.progress = callback;
            return this;
        };

        this.blocking = function(blocking = true) {
            this.blocking = blocking;
            return this;
        };

        // Execute the request
        this.send = async function() {
            if (!this.endpoint || !this.method || !this.success || !this.failure) {
                throw new Error('Required: endpoint, method, success, and failure callbacks');
            }
            return await HTTP.request({
                endpoint: this.endpoint,
                method: this.method,
                success: this.success,
                failure: this.failure,
                progress: this.progress,
                data: this.data,
                headers: this.headers,
                blocking: this.blocking,
                loader: this.loader,
                reqid: this.reqid
            });
        };
    },

    // Single request method (optimized)
    request: async function({endpoint, method, success, failure, progress, data, headers, blocking, loader, reqid}) {
        // Ensure headers always have reqid
        headers = headers || {};
        headers['reqid'] = reqid;

        if (window.fetch) {
            // Modern fetch API
            const loaderId = loader || 'global';
            const loaderMessage = loaderMessage || 'Loading...';
            const loaderEl = document.querySelector(`[data-loader="${loaderId}"]`);
            
            // Auto-show loader
            if (loaderEl) {
                loaderEl.loader?.show(loaderMessage);
            }
            try {
               
                const response = await fetch(endpoint, {
                    method: method,
                    headers: headers,
                    body: data ? data : undefined
                });

                if (!response.ok) {
                    throw new Error(`${response.status} ${response.statusText}`);
                }
                return await success(response);
            } catch(error) {
                // Show error toast if available
                const errorToast = document.querySelector('[data-toast="error"]');
                errorToast?.toast?.show(error.message);
                return await failure(error);
            } finally {
                // Auto-hide loader
                if (loaderEl) {
                    loaderEl.loader?.hide();
                }
            }
        } else {
            // Fallback XMLHttpRequest
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open(method, endpoint, !blocking);
                
                Object.entries(headers).forEach(([key, value]) => {
                    xhr.setRequestHeader(key, value);
                });

                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve(success(xhr.response));
                        } else {
                            const error = new Error(xhr.statusText);
                            reject(failure(error));
                        }
                    }
                };

                xhr.onerror = function() {
                    const error = new Error('Network error');
                    reject(failure(error));
                };

                xhr.send(data ? JSON.stringify(data) : null);
            });
        }
    },
    
    // Static convenience methods
    post(url, options = {}) {
        return new HTTP.RequestBuilder(UUID.random())
            .to(url)
            .post()
            .withContentType(options.contentType || 'json')
            .withData(options.data)
            .withHeaders(options.headers)
            .withLoader(options.loader)
            .onSuccess(options.success)
            .onFailure(options.failure || (err => console.error(err)))
            .onProgress(options.progress)
            .blocking(options.blocking || false);
    },

    get(url, options = {}) {
        return new HTTP.RequestBuilder(UUID.random())
            .to(url)
            .get()
            .withHeaders(options.headers)
            .withLoader(options.loader)
            .onSuccess(options.success)
            .onFailure(options.failure || (err => console.error(err)))
            .onProgress(options.progress);
    },

    put(url, options = {}) {
        return new HTTP.RequestBuilder(UUID.random())
            .to(url)
            .put()
            .withContentType(options.contentType || 'json')
            .withData(options.data)
            .withHeaders(options.headers)
            .withLoader(options.loader)
            .onSuccess(options.success)
            .onFailure(options.failure || (err => console.error(err)));
    },

    remove(url, options = {}) {  // 'delete' is reserved keyword
        return new HTTP.RequestBuilder(UUID.random())
            .to(url)
            .delete()
            .withHeaders(options.headers)
            .withLoader(options.loader)
            .onSuccess(options.success)
            .onFailure(options.failure || (err => console.error(err)));
    }
};
/*
// Usage examples:
HTTP.RequestBuilder(UUID.random())
    .to('/api/users')
    .post()
    .withData({name: 'John'})
    .withHeaders({'Content-Type': 'application/json'})
    .onSuccess(response => console.log('Success:', response))
    .onFailure(error => console.error('Failed:', error))
    .send();

HTTP.RequestBuilder(UUID.random())
    .to('/api/users/123')
    .get()
    .onSuccess(data => console.log(data))
    .onFailure(err => console.error(err))
    .send();

// Ultra-simple
HTTP.post('/api/users', {
    data: {name: 'John'},
    success: response => console.log(response)
});

// Even shorter with defaults
HTTP.get('/api/users/123', {success: data => console.log(data)});
*/


