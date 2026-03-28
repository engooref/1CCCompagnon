import deliveryPage from './transport';

// If using Encore entrypoint, this file is the entry that will be built

// Optionally initialize on DOMContentLoaded for non-Alpine auto init
document.addEventListener('alpine:init', () => {
    const Alpine = window.Alpine;
  if (!Alpine) {
    // eslint-disable-next-line no-console
    console.warn("[Event bundle] Alpine introuvable sur window.");
    return;
  }

  Alpine.data('deliveryPage', deliveryPage);
  
});