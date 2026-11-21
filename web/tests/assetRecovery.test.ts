// The node: prefix matters: a bare 'path' resolves to the browser polyfill
// package in node_modules.
import fs from 'node:fs';
import path from 'node:path';

// public/asset-recovery.js is a plain script shipped as-is, not a module. Run
// it against a stand-in `window` and drive the listeners it registers.
const source = fs.readFileSync(path.resolve(process.cwd(), 'public/asset-recovery.js'), 'utf8');

type Listener = (event: any) => void;

function runScript(href: string, storage: Record<string, string> | 'blocked' = {}) {
	const listeners: Record<string, Listener[]> = {};
	const win = {
		location: {
			href,
			replace: vi.fn((next: string) => {
				win.location.href = next;
			}),
		},
		sessionStorage: {
			getItem: (key: string) => {
				if (storage === 'blocked') throw new Error('storage is blocked');
				return key in storage ? storage[key] : null;
			},
			setItem: (key: string, value: string) => {
				if (storage === 'blocked') throw new Error('storage is blocked');
				storage[key] = value;
			},
		},
		history: { state: { some: 'state' }, replaceState: vi.fn() },
		addEventListener: (type: string, listener: Listener) => {
			(listeners[type] ||= []).push(listener);
		},
	};
	new Function('window', source)(win);

	const fire = (type: string, event: any) => (listeners[type] || []).forEach(l => l(event));
	return { win, fire, storage };
}

const failedScript = (src: string) => ({ target: { tagName: 'SCRIPT', src } });

describe('asset-recovery.js', () => {
	test('reloads with a cache-busting marker when a bundle script fails to load', () => {
		const { win, fire } = runScript('https://example.test/embed/video?initiallyMuted=true#t=10');

		fire('error', failedScript('https://example.test/assets/main-D2brp0wa.js'));

		expect(win.location.replace).toHaveBeenCalledTimes(1);
		const next = new URL(win.location.replace.mock.calls[0][0]);
		expect(next.pathname).toBe('/embed/video');
		expect(next.searchParams.get('initiallyMuted')).toBe('true');
		expect(next.searchParams.get('_fresh')).toBeTruthy();
		expect(next.hash).toBe('#t=10');
	});

	test('reloads when a bundle stylesheet fails to load', () => {
		const { win, fire } = runScript('https://example.test/');

		fire('error', {
			target: {
				tagName: 'LINK',
				rel: 'stylesheet',
				href: 'https://example.test/assets/main-abc.css',
			},
		});

		expect(win.location.replace).toHaveBeenCalledTimes(1);
	});

	test('ignores failures that are not a missing bundle', () => {
		const { win, fire } = runScript('https://example.test/');

		// A preload hint: the page works without it.
		fire('error', {
			target: {
				tagName: 'LINK',
				rel: 'modulepreload',
				href: 'https://example.test/assets/router-abc.js',
			},
		});
		// Other resources and third-party scripts.
		fire('error', { target: { tagName: 'IMG', src: 'https://example.test/assets/logo.png' } });
		fire('error', failedScript('https://js.stripe.com/v3/'));
		// A runtime error: the target is the window itself.
		fire('error', { target: win, message: 'boom' });
		fire('error', { target: null });

		expect(win.location.replace).not.toHaveBeenCalled();
	});

	test('does not reload twice in a row', () => {
		const { win, fire } = runScript('https://example.test/');

		fire('error', failedScript('https://example.test/assets/main-old.js'));
		// The reloaded page (marker now in the address) fails the same way.
		fire('error', failedScript('https://example.test/assets/main-old.js'));

		expect(win.location.replace).toHaveBeenCalledTimes(1);
	});

	test('does not reload again shortly after a reload, even without the marker', () => {
		const recent = { 'aoitube:asset-recovery': String(Date.now() - 5_000) };
		const { win, fire } = runScript('https://example.test/', recent);

		fire('error', failedScript('https://example.test/assets/main-old.js'));

		expect(win.location.replace).not.toHaveBeenCalled();
	});

	test('reloads again once the earlier attempt is long past', () => {
		const old = { 'aoitube:asset-recovery': String(Date.now() - 10 * 60_000) };
		const { win, fire, storage } = runScript('https://example.test/', old);

		fire('error', failedScript('https://example.test/assets/main-old.js'));

		expect(win.location.replace).toHaveBeenCalledTimes(1);
		expect(Number((storage as Record<string, string>)['aoitube:asset-recovery'])).toBeGreaterThan(
			Date.now() - 5_000,
		);
	});

	test('still reloads once when session storage is blocked', () => {
		const { win, fire } = runScript('https://example.test/', 'blocked');

		fire('error', failedScript('https://example.test/assets/main-old.js'));
		fire('error', failedScript('https://example.test/assets/main-old.js'));

		expect(win.location.replace).toHaveBeenCalledTimes(1);
	});

	test('reloads when a lazily loaded chunk is missing and swallows the import error', () => {
		const { win, fire } = runScript('https://example.test/');
		const event = { preventDefault: vi.fn() };

		fire('vite:preloadError', event);

		expect(win.location.replace).toHaveBeenCalledTimes(1);
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
	});

	test('lets the import error through when a reload was already tried', () => {
		const { win, fire } = runScript('https://example.test/?_fresh=abc');
		const event = { preventDefault: vi.fn() };

		fire('vite:preloadError', event);

		expect(win.location.replace).not.toHaveBeenCalled();
		expect(event.preventDefault).not.toHaveBeenCalled();
	});

	test('removes the marker from the address once the page has loaded', () => {
		const { win, fire } = runScript('https://example.test/archive/abc?_fresh=xyz&lang=ja#chat');

		fire('load', {});

		expect(win.history.replaceState).toHaveBeenCalledWith(
			{ some: 'state' },
			'',
			'/archive/abc?lang=ja#chat',
		);
	});

	test('leaves the address alone on a normal load', () => {
		const { win, fire } = runScript('https://example.test/?lang=ja');

		fire('load', {});

		expect(win.history.replaceState).not.toHaveBeenCalled();
	});
});
