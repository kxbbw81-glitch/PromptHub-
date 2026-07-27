(function () {
  'use strict';

  function copyText(text) {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    return Promise.resolve();
  }

  function bindCopyButtons() {
    document.querySelectorAll('[data-copy-target]').forEach(button => {
      button.addEventListener('click', () => {
        const target = document.getElementById(button.dataset.copyTarget || '');
        if (!target) return;

        copyText(target.textContent || '').then(() => {
          const label = button.textContent;
          button.textContent = 'Copied';
          setTimeout(() => { button.textContent = label; }, 1600);
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindCopyButtons);
  } else {
    bindCopyButtons();
  }
})();
