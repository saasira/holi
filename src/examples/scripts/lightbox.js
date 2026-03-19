(function initLightboxExample() {
    const gallery = document.querySelector('[data-role="lightbox-gallery"]');
    const dialogHost = document.getElementById('gallery-lightbox');
    if (!gallery || !dialogHost) return;

    const getDialogInstance = () => dialogHost.dialogcomponent || null;
    const getCarouselInstance = () => {
        const candidates = dialogHost.querySelectorAll('carousel, [component="carousel"], [role="carousel"]');
        for (let i = 0; i < candidates.length; i += 1) {
            const instance = candidates[i].carouselcomponent;
            if (instance) return instance;
        }
        return null;
    };
    let pendingIndex = 0;

    const syncToPendingIndex = () => {
        const carousel = getCarouselInstance();
        if (!carousel) return false;
        carousel.goToSlide(pendingIndex, false);
        return true;
    };

    gallery.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-lightbox-index]');
        if (!trigger) return;

        const dialog = getDialogInstance();
        if (!dialog) return;

        const index = Number(trigger.getAttribute('data-lightbox-index'));
        pendingIndex = Number.isFinite(index) ? index : 0;

        dialog.open();
        if (syncToPendingIndex()) return;
        requestAnimationFrame(() => {
            syncToPendingIndex();
        });
    });

    dialogHost.addEventListener('dialogopen', () => {
        syncToPendingIndex();
    });
})();
