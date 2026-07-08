import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Backend paths proxied to the AoiTube Go server during development. Mirrors
// the former next.config.mjs `rewrites` map.
const PROXY_PATHS = ['/api', '/hls', '/img', '/logo', '/thumbnail.jpg', '/customjavascript'];

// Server-injected metadata for the viewer shell. The Go server processes
// `index.html` through html/template (controllers/index.go -> renderIndexHtml)
// and replaces these placeholders at request time. Bots read the resulting
// OpenGraph tags; the browser reads window.*Hydration for first paint. The app
// still falls back to the API when hydration is absent (e.g. dev).
const SERVER_METADATA = `
    <meta name="description" content="{{.Summary}}" />
    <meta property="og:title" content="{{.Name}}" />
    <meta property="og:site_name" content="{{.Name}}" />
    <meta property="og:url" content="{{.RequestedURL}}" />
    <meta property="og:description" content="{{.Summary}}" />
    <meta property="og:type" content="video.other" />
    <meta property="video:tag" content="{{.TagsString}}" />
    <meta property="og:image" content="{{.RequestedURL}}{{.Thumbnail}}" />
    <meta property="og:image:url" content="{{.RequestedURL}}{{.Thumbnail}}" />
    <meta property="og:image:alt" content="{{.RequestedURL}}{{.Image}}" />
    <meta property="og:video" content="{{.RequestedURL}}/embed/video" />
    <meta property="og:video:secure_url" content="{{.RequestedURL}}/embed/video" />
    <meta property="og:video:height" content="315" />
    <meta property="og:video:width" content="560" />
    <meta property="og:video:type" content="text/html" />
    <meta property="og:video:actor" content="{{.Name}}" />
    <meta property="twitter:title" content="{{.Name}}" />
    <meta property="twitter:url" content="{{.RequestedURL}}" />
    <meta property="twitter:description" content="{{.Summary}}" />
    <meta property="twitter:image" content="{{.Image}}" />
    <meta property="twitter:card" content="player" />
    <meta property="twitter:player" content="{{.RequestedURL}}/embed/video" />
    <meta property="twitter:player:width" content="560" />
    <meta property="twitter:player:height" content="315" />
    <script nonce="{{.Nonce}}">
      window.configHydration = {{.ServerConfigJSON}};
      window.statusHydration = {{.StatusJSON}};
    </script>`;

// Injects the Go-template server metadata into the viewer `index.html` at build
// time only (dev has no server template). The admin shell is served verbatim by
// Go and must not contain template placeholders.
function serverMetadataPlugin(): Plugin {
	return {
		name: 'aoitube-server-metadata',
		transformIndexHtml: {
			order: 'post',
			handler(html, ctx) {
				// Skip in dev (ctx.server is set) and for the admin entry.
				if (ctx.server) return html;
				if (ctx.path.replace(/\\/g, '/').includes('/admin/')) return html;
				return html
					.replace('<title>AoiTube</title>', '<title>{{.Name}}</title>')
					.replace('</head>', `${SERVER_METADATA}\n  </head>`);
			},
		},
	};
}

// Serves the correct MPA shell for extensionless client-side routes during
// `vite dev` and `vite preview`, mirroring the Go SPA fallback in
// controllers/web.go (admin routes -> admin/index.html, everything else ->
// index.html).
function mpaFallbackPlugin(): Plugin {
	const shellFor = (url: string): string | null => {
		const pathname = url.split('?')[0];
		if (/\.[a-zA-Z0-9]+$/.test(pathname)) return null; // real file request
		if (/^\/(@|src\/|node_modules\/|assets\/)/.test(pathname)) return null; // vite internals / assets
		if (PROXY_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))) return null;
		return pathname.startsWith('/admin') ? '/admin/index.html' : '/index.html';
	};
	return {
		name: 'aoitube-mpa-fallback',
		configureServer(server) {
			return () => {
				server.middlewares.use(async (req, res, next) => {
					const shell = req.url && shellFor(req.url);
					if (!shell) return next();
					try {
						const file = path.join(server.config.root, shell.slice(1));
						const raw = readFileSync(file, 'utf-8');
						const html = await server.transformIndexHtml(req.url!, raw);
						res.statusCode = 200;
						res.setHeader('Content-Type', 'text/html');
						res.end(html);
					} catch (e) {
						next(e as Error);
					}
				});
			};
		},
		configurePreviewServer(server) {
			return () => {
				server.middlewares.use((req, res, next) => {
					const shell = req.url && shellFor(req.url);
					if (!shell) return next();
					try {
						const file = path.join(__dirname, 'out', shell.slice(1));
						res.statusCode = 200;
						res.setHeader('Content-Type', 'text/html');
						res.end(readFileSync(file));
					} catch {
						next();
					}
				});
			};
		},
	};
}

export default defineConfig(({ mode }) => {
	// Load NEXT_PUBLIC_* (kept for source compatibility) from .env.[mode].
	const env = loadEnv(mode, __dirname, ['NEXT_PUBLIC_', 'VITE_']);
	const isProd = mode === 'production';

	return {
		base: '/',
		// Two HTML entries (viewer + admin); the mpaFallbackPlugin below provides
		// the per-entry deep-link fallback instead of Vite's single-page fallback.
		appType: 'mpa',
		plugins: [
			react(),
			// Import `.svg?react` as a React component (default export), replacing the
			// former @svgr/webpack rule.
			svgr(),
			tsconfigPaths(),
			serverMetadataPlugin(),
			mpaFallbackPlugin(),
		],
		define: {
			// Node's `global` is not defined in the browser. Next.js/webpack
			// polyfilled it automatically; Vite does not, so some dependencies
			// (surfacing first in the admin bundle) threw "global is not defined".
			// A build-time replacement to `globalThis` is CSP-safe (no inline
			// polyfill script, which the strict script-src would block).
			global: 'globalThis',
			'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
			'process.env.NEXT_PUBLIC_API_HOST': JSON.stringify(env.NEXT_PUBLIC_API_HOST ?? ''),
			'process.env.NEXT_PUBLIC_ADMIN_USERNAME': JSON.stringify(env.NEXT_PUBLIC_ADMIN_USERNAME ?? ''),
			'process.env.NEXT_PUBLIC_ADMIN_STREAMKEY': JSON.stringify(
				env.NEXT_PUBLIC_ADMIN_STREAMKEY ?? '',
			),
		},
		css: {
			preprocessorOptions: {
				scss: {
					// Mirrors next.config.mjs sassOptions.includePaths (modern Sass API
					// renames this to loadPaths).
					loadPaths: [path.join(__dirname, 'styles')],
				},
			},
		},
		server: {
			port: 3000,
			proxy: Object.fromEntries(
				PROXY_PATHS.map(p => [p, { target: 'http://localhost:8080', changeOrigin: true }]),
			),
		},
		build: {
			outDir: 'out',
			emptyOutDir: true,
			// Avoid the inline module-preload polyfill script so the app stays
			// compatible with the strict `script-src` CSP set by the Go server.
			modulePreload: { polyfill: false },
			rollupOptions: {
				input: {
					main: path.resolve(__dirname, 'index.html'),
					admin: path.resolve(__dirname, 'admin/index.html'),
				},
			},
		},
	};
});
