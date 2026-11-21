/*
 * Recovers from a stale HTML shell.
 *
 * The shell names its JavaScript and CSS bundles by content hash. When a CDN
 * or a browser serves a copy of the shell from before the last deploy, those
 * names no longer exist on the server and the page stays blank. Loaded before
 * the app, this script notices a bundle that failed to load and reloads the
 * page once with a cache-busting query, which gets past the cached copy.
 *
 * It is a plain script with a fixed name on purpose: it has to work when
 * nothing else on the page loaded, and a stale shell must still find it.
 * Everything goes through `window.` so the tests can hand it a stand-in.
 */
(function () {
	'use strict';

	// Query parameter that marks a recovery reload.
	const MARKER = '_fresh';
	const STORAGE_KEY = 'aoitube:asset-recovery';
	// A second failure this soon after a reload means reloading doesn't help.
	const RETRY_WINDOW_MS = 60 * 1000;

	function isBundle(url) {
		return typeof url === 'string' && url.indexOf('/assets/') !== -1;
	}

	function reloadedRecently() {
		try {
			const last = Number(window.sessionStorage.getItem(STORAGE_KEY) || 0);
			return Date.now() - last < RETRY_WINDOW_MS;
		} catch (e) {
			// Storage can be blocked; the marker in the address still stops a loop.
			return false;
		}
	}

	function rememberReload() {
		try {
			window.sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
		} catch (e) {
			// See reloadedRecently.
		}
	}

	// Reloads past any cached copy of the shell. Returns false when a reload
	// was already tried, so a bundle that is really missing can't cause a loop.
	function reloadFresh() {
		const url = new URL(window.location.href);
		if (url.searchParams.has(MARKER) || reloadedRecently()) {
			return false;
		}
		rememberReload();
		url.searchParams.set(MARKER, Date.now().toString(36));
		window.location.replace(url.toString());
		return true;
	}

	// A <script> or stylesheet that fails to load fires `error` on the element.
	// The event doesn't bubble, so it has to be caught in the capture phase.
	window.addEventListener(
		'error',
		function (event) {
			const el = event.target;
			if (!el || el === window || !el.tagName) {
				return;
			}
			if (el.tagName === 'SCRIPT' && isBundle(el.src)) {
				reloadFresh();
			} else if (el.tagName === 'LINK' && el.rel === 'stylesheet' && isBundle(el.href)) {
				reloadFresh();
			}
		},
		true,
	);

	// Vite reports a lazily loaded chunk that could not be fetched, which is
	// what a tab left open across a deploy runs into.
	window.addEventListener('vite:preloadError', function (event) {
		if (reloadFresh()) {
			// The page is reloading; don't surface the import error as well.
			event.preventDefault();
		}
	});

	// Once the fresh shell has loaded, take the marker out of the address.
	window.addEventListener('load', function () {
		const url = new URL(window.location.href);
		if (!url.searchParams.has(MARKER)) {
			return;
		}
		url.searchParams.delete(MARKER);
		window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
	});
})();
