// global_loading.js

const GlobalLoading = (function() {
	let overlay = null;
	let messageEl = null;
	let detailEl = null;
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
				background: rgba(15, 23, 42, 0.65);
				display: flex;
				justify-content: center;
				align-items: center;
				z-index: 9999;
			}
			.global-loading-card {
				width: min(420px, calc(100% - 32px));
				padding: 22px;
				border-radius: 14px;
				background: #ffffff;
				box-shadow: 0 20px 40px rgba(2, 6, 23, 0.25);
				text-align: center;
			}
			.global-loading-spinner {
				width: 50px;
				height: 50px;
				border: 4px solid #f3f3f3;
				border-top: 4px solid #3498db;
				border-radius: 50%;
				animation: global-loading-spin 0.8s linear infinite;
				margin: 0 auto;
			}
			.global-loading-message {
				margin-top: 14px;
				font-size: 16px;
				font-weight: 600;
				color: #0f172a;
			}
			.global-loading-detail {
				margin-top: 6px;
				font-size: 13px;
				color: #64748b;
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
		el.innerHTML = `
			<div class="global-loading-card">
				<div class="global-loading-spinner"></div>
				<div class="global-loading-message">요청을 준비하고 있습니다.</div>
				<div class="global-loading-detail">잠시만 기다려주세요.</div>
			</div>
		`;
		messageEl = el.querySelector('.global-loading-message');
		detailEl = el.querySelector('.global-loading-detail');
		return el;
	}

	return {
		show(message = '요청을 처리하고 있습니다.', detail = '잠시만 기다려주세요.') {
			if (overlay) return;
			injectStyle();
			overlay = createOverlay();
			document.body.appendChild(overlay);
			this.setMessage(message, detail);
		},

		setMessage(message, detail = '') {
			if (!overlay) return;
			if (messageEl) messageEl.textContent = message || '';
			if (detailEl) detailEl.textContent = detail || '';
		},

		hide() {
			if (!overlay) return;
			overlay.remove();
			overlay = null;
			messageEl = null;
			detailEl = null;
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
