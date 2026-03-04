const Q = function(input) {
    let element = null;
    let elements = [];
    let selector = null;

    // Initialize based on input type
    if (input?.nodeType === 9 || input === window || input === document) {
        element = input.documentElement || input;
    } else if (input instanceof HTMLElement) {
        element = input;
        elements = [input];
    } else if (input instanceof NodeList || input instanceof HTMLCollection) {
        elements = Array.from(input);
        element = elements[0] || null;
    } else if (Array.isArray(input)) {
        elements = input;
        element = input[0] || null;
    } else if (typeof input === 'string') {
        selector = normalizeSelector(input);
        element = document.querySelector(selector);
        elements = element ? [element] : [];
    }

    function normalizeSelector(sel) {
        return sel
            .replace(/option:selected/g, 'option:checked')
            .replace(/:input/g, 'input,select,textarea,button');
    }

    function ensureElements() {
        if (!elements.length && selector) {
            const nodes = document.querySelectorAll(selector);
            elements = Array.from(nodes);
            element = elements[0] || null;
        }
        return !!elements.length;
    }

    function findInContext(filter) {
        const normalized = normalizeSelector(filter);
        if (element) {
            const nodes = element.querySelectorAll(normalized);
            return Array.from(nodes);
        }
        return [];
    }

    // Core methods
    return {
        first: () => element || document.querySelector(selector) || null,
        
        all: () => {
            ensureElements();
            return [...elements];
        },

        empty: () => {
            if (!ensureElements()) return this;
            elements.forEach(el => el.replaceChildren());
            return this;
        },

        remove: () => {
            if (!ensureElements()) return this;
            elements.forEach(el => el.remove());
            elements = [];
            element = null;
            return this;
        },

        text: (content) => {
            if (content === undefined) {
                return element?.textContent || '';
            }
            if (!ensureElements()) return this;
            elements.forEach(el => el.textContent = content);
            return this;
        },

        html: (content) => {
            if (content === undefined) {
                return element?.innerHTML || '';
            }
            if (!ensureElements()) return this;
            elements.forEach(el => el.innerHTML = content);
            return this;
        },

        parse: (text) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            return doc.body.children.length ? doc.body : doc.body.firstElementChild; //[web:37][web:32]
        },

        append: (content) => {
            if (!ensureElements()) return this;
            elements.forEach(el => {
                if (content instanceof HTMLElement) {
                    el.append(content);
                } else if (typeof content === 'string' && /^<[^>]+>.*<\/[^>]+>$/.test(content)) {
                    el.insertAdjacentHTML('beforeend', content);
                } else {
                    el.append(content);
                }
            });
            return this;
        },

        prepend: (content) => {
            if (!ensureElements()) return this;
            elements.forEach(el => {
                if (content instanceof HTMLElement) {
                    el.prepend(content);
                } else if (typeof content === 'string' && /^<[^>]+>.*<\/[^>]+>$/.test(content)) {
                    el.insertAdjacentHTML('afterbegin', content);
                } else {
                    el.prepend(content?.nodeType ? content : document.createTextNode(content));
                }
            });
            return this;
        },

        parent: () => {
            element = element?.parentElement || null;
            return this;
        },

        closest: (filter) => {
            element = element?.closest(filter) || null;
            return this;
        },

        previous: (filter) => {
            let sibling = element?.previousElementSibling;
            while (sibling && filter && !sibling.matches(filter)) {
                sibling = sibling.previousElementSibling;
            }
            return sibling;
        },

        next: (filter) => {
            let sibling = element?.nextElementSibling;
            while (sibling && filter && !sibling.matches(filter)) {
                sibling = sibling.nextElementSibling;
            }
            return sibling;
        },

        clone: () => element?.cloneNode(true),

        val: (value) => {
            if (value === undefined) {
                return element?.value || '';
            }
            if (!ensureElements()) return this;
            elements.forEach(el => el.value = value);
            return this;
        },

        attr: (name, value, remove = false) => {
            if (value === undefined) {
                return element?.getAttribute(name);
            }
            if (remove) {
                if (ensureElements()) elements.forEach(el => el.removeAttribute(name));
            } else {
                if (ensureElements()) elements.forEach(el => el.setAttribute(name, value));
            }
            return this;
        },

        data: (name, value) => {
            const dataName = `data-${name}`;
            if (value === undefined) {
                return element?.getAttribute(dataName);
            }
            if (ensureElements()) {
                elements.forEach(el => el.setAttribute(dataName, value));
            }
            return this;
        },

        each: (func) => {
            if (!ensureElements()) return this;
            elements.forEach((el, i) => func(i, el));
            return this;
        },

        css: (styles, value) => {
            if (!ensureElements()) return this;
            const rules = typeof styles === 'string' ? { [styles]: value } : styles;
            elements.forEach(el => {
                Object.entries(rules).forEach(([k, v]) => {
                    el.style[k] = v;
                });
            });
            return this;
        },

        find: (filter) => {
            elements = findInContext(filter);
            element = elements[0] || null;
            return this;
        },

        // Event utilities
        on: (event, selector, listener) => {
            if (!ensureElements()) return this;
            const useDelegate = typeof selector === 'string';
            const targetSelector = useDelegate ? selector : null;
            
            elements.forEach(el => {
                el.addEventListener(event, e => {
                    const target = e.target.closest(targetSelector);
                    if (target) listener.call(target, e); //[web:33][web:38]
                }, { capture: false, passive: true });
            });
            return this;
        },

        // Common event shorthands (now use on())
        click: (selector, listener) => this.on('click', selector, listener),
        change: (selector, listener) => this.on('change', selector, listener),
        // ... other events via on()

        show: (modal = false) => {
            if (!element) return this;
            if (element.showModal) {
                modal ? element.showModal() : element.show(); //[web:35][web:40]
            } else {
                element.classList.remove('hidden');
            }
            return this;
        },

        hide: (returnValue) => {
            if (!element) return this;
            if (element.close) {
                element.close(returnValue);
            } else {
                element.classList.add('hidden');
            }
            return this;
        },

        // Optimized cookie with proper encoding
        cookie: (key, value, expiry = 1800, path = '/') => {
            if (value !== undefined) {
                const encoded = btoa(encodeURIComponent(value));
                document.cookie = `${key}=${encoded};max-age=${expiry};path=${path};SameSite=Strict`;
            } else {
                const match = document.cookie.match(`(^|;) ?${key}=([^;]*)(;|$)`);
                if (match) {
                    return decodeURIComponent(atob(match[2])); //[web:34][web:39]
                }
            }
            return value !== undefined ? this : null;
        },

        is: (selector) => element?.matches(selector) || false,
        
        index: () => {
            const parent = element?.parentElement?.children;
            return parent ? Array.from(parent).indexOf(element) : -1;
        },
        
        eq: (index) => {
            ensureElements();  // Ensure collection exists first
            const idx = index < 0 ? elements.length + index : index;  // Negative index support
            element = elements[idx] || null;
            elements = element ? [elements[idx]] : [];
            return this;
        },
        
        first: () => {
            if (elements.length > 0) {
                element = elements[0];
                return this;
            }
            if (selector && !element) {
                element = document.querySelector(selector);
                elements = element ? [element] : [];
            }
            return this;
        },

        last: () => {
            if (ensureElements()) {
                element = elements[elements.length - 1];
            }
            return this;
        },
        
        fadeIn: (duration = 400, complete) => {
            elements.forEach(el => {
                el.style.opacity = '0';
                el.style.display = 'block';
            });
            this.animate({ opacity: 1 }, duration, 'swing', complete);
            return this;
        },

        fadeOut: (duration = 400, complete) => {
            this.animate({ opacity: 0 }, duration, 'swing', () => {
                elements.forEach(el => el.style.display = 'none');
                complete?.call(el);
            });
            return this;
        },
        
        animate: (properties, duration = 400, easing = 'swing', complete) => {
            if (!ensureElements()) return this;

            const easings = {
                swing: t => t * t * (3 - 2 * t),  // Quadratic ease-in-out
                linear: t => t
            };

            const easeFn = easings[easing] || easings.swing;

            elements.forEach(el => {
                const startState = {};
                const animQueue = [];

                // Capture starting values
                Object.keys(properties).forEach(prop => {
                    const value = properties[prop];
                    if (value === 'toggle') {
                        properties[prop] = el.style[prop] === 'none' ? 'block' : 'none';
                    }
                    startState[prop] = parseFloat(getComputedStyle(el)[prop]) || 0;
                });

                let startTime = null;

                const animateFrame = (time) => {
                    if (!startTime) startTime = time;
                    const progress = Math.min(1, (time - startTime) / duration);
                    const eased = easeFn(progress);

                    // Apply interpolated values
                    Object.keys(properties).forEach(prop => {
                        const start = startState[prop];
                        const end = parseFloat(properties[prop]) || 0;
                        el.style[prop] = Math.round(eased * (end - start) + start) + 
                                       (prop === 'scrollLeft' || prop === 'scrollTop' ? '' : 'px');
                    });

                    if (progress < 1) {
                        requestAnimationFrame(animateFrame);
                    } else if (complete) {
                        complete.call(el);
                    }
                };

                requestAnimationFrame(animateFrame);
            });

            return this;
        },
        
        slideToggle: (duration = 400, complete) => {
            elements.forEach(el => {
                const isVisible = el.clientHeight > 0;
                el.style.overflow = 'hidden';
                el.style.height = isVisible ? el.scrollHeight + 'px' : '0px';
            });
            this.animate({ 
                height: 'toggle' === el.clientHeight ? '0px' : el.scrollHeight + 'px',
                opacity: 1 
            }, duration, 'swing', () => {
                elements.forEach(el => {
                    el.style.height = '';
                    el.style.overflow = '';
                    if (el.clientHeight === 0) el.style.display = 'none';
                });
                complete?.call(el);
            });
            return this;
        },

        toggle: (show = null) => {
            elements.forEach(el => el.hidden = show !== null ? !show : !el.hidden);
            return this;
        },
        
        hasClass: (name) => element?.classList.contains(name) || false,
        
        addClass: (name) => {
            if (!ensureElements()) return this;
            elements.forEach(el => el.classList.add(name));
            return this;
        },

        removeClass: (name) => {
            if (!ensureElements()) return this;
            elements.forEach(el => el.classList.remove(name));
            return this;
        },

        toggleClass: (name) => {
            if (!ensureElements()) return this;
            elements.forEach(el => el.classList.toggle(name));
            return this;
        },

        trigger: (eventName, options = {}) => {
            if (!ensureElements()) return this;
            elements.forEach(el => {
                const event = new CustomEvent(eventName, { bubbles: true, ...options });
                el.dispatchEvent(event);
            });
            return this;
        },
        
        serialize: () => {
            const formData = new FormData(element);
            return new URLSearchParams(formData).toString();
        },
        after: (content) => {
            if (!ensureElements()) return this;
            elements.forEach(el => {
                if (content instanceof HTMLElement || content instanceof Node) {
                    el.after(content);
                } else if (typeof content === 'string' && /^<[^>]+>.*<\/[^>]+>$/.test(content)) {
                    el.insertAdjacentHTML('afterend', content);
                } else {
                    el.after(document.createTextNode(content));
                }
            });
            return this;
        },

        before: (content) => {
            if (!ensureElements()) return this;
            elements.forEach(el => {
                if (content instanceof HTMLElement || content instanceof Node) {
                    el.before(content);
                } else if (typeof content === 'string' && /^<[^>]+>.*<\/[^>]+>$/.test(content)) {
                    el.insertAdjacentHTML('beforebegin', content);
                } else {
                    el.before(document.createTextNode(content));
                }
            });
            return this;
        },

        siblings: (filter) => {
            if (!element) return [];
            const parent = element.parentElement;
            if (!parent) return [];
            const sibs = Array.from(parent.children);
            if (!filter) return sibs.filter(s => s !== element);
            return sibs.filter(s => s.matches(filter));
        },
        
        // Position utilities
        offset: () => {
            if (!element) return { top: 0, left: 0 };
            const rect = element.getBoundingClientRect();
            return {
                top: rect.top + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width,
                height: rect.height
            };
        },

        position: () => {
            if (!element || !element.parentElement) return { top: 0, left: 0 };
            const parentRect = element.parentElement.getBoundingClientRect();
            const rect = element.getBoundingClientRect();
            return {
                top: rect.top - parentRect.top,
                left: rect.left - parentRect.left
            };
        },
        
        ready: (callback) => {
            // Document-level ready (jQuery $(document).ready())
            if (input === document || input === window || input === null) {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', callback);
                } else {
                    callback();
                }
                return this;
            }
            
            // Element-level visibility ready (using Element.checkVisibility())
            if (input instanceof HTMLElement || element) {
                const targetEl = element || input;
                
                // Check if already visible
                if (targetEl.checkVisibility()) {
                    callback.call(targetEl);
                    return this;
                }
                
                // Wait for element to become visible
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting && targetEl.checkVisibility()) {
                            observer.disconnect();
                            callback.call(targetEl);
                        }
                    });
                }, { threshold: 0.01 });
                
                observer.observe(targetEl);
                return this;
            }
            
            return this;
        }
    };
};

// NEW: AJAX (perfectly integrates with your HTTP client)
Q.ajax = function (options) {            
    const builder = new HTTP.RequestBuilder(UUID.random())
        .to(options.url)
        .method(options.method || HTTP.Method.GET);

    if (options.data) builder.withData(options.data);
    if (options.contentType) builder.withContentType(options.contentType);
    if (options.headers) builder.withHeaders(options.headers);
    if(options.loader) { builder.withLoader(options.loader); }

    builder.onSuccess(options.success || (() => {}))
            .onFailure(options.error || (() => {}));

    return builder.send();
};

// Promise wrapper with loader (bonus utility)
Q.withLoader = function(loaderId, promise, message = 'Loading...') {
    const loaderEl = document.querySelector(`[data-loader="${loaderId}"]`);
    if (loaderEl) loaderEl.loader?.show(message);
    
    return promise.finally(() => {
        if (loaderEl) loaderEl.loader?.hide();
    });
};

// Perfect file upload with progress
Q.upload = async function(file, url, options = {}) {
    const formData = new FormData();
    formData.append('file', file);
    
    const loaderId = options.loader || 'upload';
    const progressId = options.progress || 'upload';
    
    return Q.ajax(url, {
        method: 'POST',
        body: formData,
        loader: loaderId,
        progress: progressId,
        onProgress: (e) => {
            ProgressBar.fromEvent(e, { progressId });
        }
    });
};


// Global utility
Q.scrollToTop = () => {
    document.querySelector('.back-to-top')?.backToTop?.scrollToTop();
};





