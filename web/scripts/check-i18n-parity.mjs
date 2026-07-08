// Verifies the five locale catalogs expose the same key set and that every
// i18n key referenced from source resolves in every catalog.
// Usage: node scripts/check-i18n-parity.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['ja', 'en', 'zh', 'zh-TW', 'ko'];
const REFERENCE = 'ja';

function flatten(obj, prefix = '', out = new Set()) {
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === 'object') flatten(v, key, out);
		else out.add(key);
	}
	return out;
}

const catalogs = Object.fromEntries(
	LOCALES.map(l => [
		l,
		flatten(JSON.parse(readFileSync(join(root, 'i18n/locales', `${l}.json`), 'utf8'))),
	]),
);

let failed = false;
const ref = catalogs[REFERENCE];
for (const l of LOCALES) {
	if (l === REFERENCE) continue;
	const missing = [...ref].filter(k => !catalogs[l].has(k));
	const extra = [...catalogs[l]].filter(k => !ref.has(k));
	if (missing.length || extra.length) {
		failed = true;
		console.error(`[${l}] missing=${missing.length} extra=${extra.length}`);
		for (const k of missing.slice(0, 20)) console.error(`  missing: ${k}`);
		for (const k of extra.slice(0, 20)) console.error(`  extra:   ${k}`);
	}
}

// Source scan: every string literal that looks like a catalog key must
// resolve in every catalog. Keys are detected by matching a known top-level
// namespace prefix so plain words don't false-positive.
const namespaces = new Set(
	Object.keys(JSON.parse(readFileSync(join(root, 'i18n/locales/ja.json'), 'utf8'))),
);
const keyPattern = /['"`]([a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)+)['"`]/g;

function* walk(dir) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
		const p = join(dir, e.name);
		if (e.isDirectory()) yield* walk(p);
		else if (/\.(tsx?|jsx?)$/.test(e.name)) yield p;
	}
}

const referenced = new Set();
for (const d of ['components', 'pages', 'utils', 'src']) {
	for (const f of walk(join(root, d))) {
		const src = readFileSync(f, 'utf8');
		for (const m of src.matchAll(keyPattern)) {
			const key = m[1];
			if (namespaces.has(key.split('.')[0]) && ref.has(key)) referenced.add(key);
		}
	}
}

for (const l of LOCALES) {
	const unresolved = [...referenced].filter(k => !catalogs[l].has(k));
	if (unresolved.length) {
		failed = true;
		console.error(`[${l}] referenced keys unresolved: ${unresolved.length}`);
		for (const k of unresolved.slice(0, 20)) console.error(`  ${k}`);
	}
}

if (failed) {
	process.exit(1);
}
console.log(
	`i18n parity OK: ${LOCALES.length} catalogs, ${ref.size} keys, ${referenced.size} referenced from source`,
);
