import { LoaderComponent } from '../components/loader.js';

function createLoaderHost(scope = 'block') {
    const host = document.createElement('section');
    host.setAttribute('component', 'loader');
    host.setAttribute('scope', scope);
    host.hidden = true;
    return host;
}

function attachLoaderState(owner, options = {}) {
    const host = options.host || owner?.element || owner?.container || null;
    if (!(host instanceof HTMLElement)) {
        return {
            setLoading() {},
            destroy() {}
        };
    }

    const busyTarget = options.busyTarget instanceof HTMLElement ? options.busyTarget : host;
    const scope = options.scope || 'block';
    const defaultMessage = String(options.defaultMessage || 'Loading...');

    let loaderMount = host.querySelector('[data-role="component-loader"]');
    if (!loaderMount) {
        loaderMount = createLoaderHost(scope);
        loaderMount.setAttribute('data-role', 'component-loader');
        host.appendChild(loaderMount);
    } else if (!loaderMount.getAttribute('scope')) {
        loaderMount.setAttribute('scope', scope);
    }

    const loader = loaderMount.loadercomponent || new LoaderComponent(loaderMount);
    loader.hide();

    return {
        setLoading(loading, message = '') {
            const active = !!loading;
            const text = String(message || defaultMessage || 'Loading...');
            busyTarget.setAttribute('aria-busy', active ? 'true' : 'false');
            if (active) {
                loader.show(text);
                return;
            }
            loader.hide();
        },
        destroy() {
            busyTarget.removeAttribute('aria-busy');
            loader.hide();
        }
    };
}

export { attachLoaderState };
