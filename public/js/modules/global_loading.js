// global_loading.js

const GlobalLoading = (function() {
	let overlay = null;
	let styleInjected = false;

	function injectStyle() {
		if (styleInjected) return;
		
		const style = document.createElement('style');
		style.textContent = `
			#global-loading-overlay {
				position: fixed;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				background: rgba(0, 0, 0, 0.5);
				display: flex;
				justify-content: center;
				align-items: center;
				z-index: 9999;
			}
			.global-loading-spinner {
				width: 50px;
				height: 50px;
				border: 4px solid #f3f3f3;
				border-top: 4px solid #3498db;
				border-radius: 50%;
				animation: global-loading-spin 0.8s linear infinite;
			}
			@keyframes global-loading-spin {
				0% { transform: rotate(0deg); }
				100% { transform: rotate(360deg); }
			}
		`;
		document.head.appendChild(style);
		styleInjected = true;
	}

	function createOverlay() {
		const el = document.createElement('div');
		el.id = 'global-loading-overlay';
		el.innerHTML = `<div class="global-loading-spinner"></div>`;
		return el;
	}

	return {
		show() {
			if (overlay) return;
			injectStyle();
			overlay = createOverlay();
			document.body.appendChild(overlay);
		},

		hide() {
			if (!overlay) return;
			overlay.remove();
			overlay = null;
		},

		async wrap(asyncFn) {
			this.show();
			try {
				return await asyncFn();
			} finally {
				this.hide();
			}
		}
	};
})();

export default GlobalLoading;