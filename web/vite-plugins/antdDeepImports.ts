import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// `import { Button } from 'antd'` goes through antd's index file, which
// re-exports every component. The bundler then treats everything antd has as a
// dependency of whichever chunk holds that import, so the components only a
// moderator modal or the admin use (Table, Tree, Form, DatePicker...) all land
// in the bundle every visitor downloads first. Importing each component from
// its own module (`antd/es/button`) removes that link and lets every
// component go where it is actually used: about 0.7 MB less in the first load.
//
// The source keeps the short barrel imports. This plugin rewrites them for
// production builds only; the dev server pre-bundles antd as a whole anyway.

const NAMED_IMPORT_FROM_ANTD = /import\s*\{([^}]*)\}\s*from\s*['"]antd['"];?/g;
const BARREL_EXPORT = /^export \{ default as ([A-Za-z_$][\w$]*) \} from '\.\/([a-z0-9-]+)';$/gm;
const IMPORT_SPECIFIER = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/;

/**
 * Maps every component the antd index file re-exports to its own module, e.g.
 * `Button` to `antd/es/button`.
 */
export function readAntdExports(barrelSource: string): Map<string, string> {
	const exportsByName = new Map<string, string>();
	for (const match of barrelSource.matchAll(BARREL_EXPORT)) {
		exportsByName.set(match[1], `antd/es/${match[2]}`);
	}
	return exportsByName;
}

export type RewriteResult = {
	code: string;
	// Specifiers that had to stay on the barrel import because the index file
	// doesn't re-export them as a component of their own.
	unresolved: string[];
};

/**
 * Rewrites `import { A, B as C } from 'antd'` into one default import per
 * component. Returns null when the code has nothing to rewrite.
 *
 * The replacement keeps the number of lines the statement took, so line
 * numbers in the rest of the module don't move.
 */
export function rewriteAntdImports(
	code: string,
	exportsByName: Map<string, string>,
): RewriteResult | null {
	const unresolved: string[] = [];
	let changed = false;

	const rewritten = code.replace(NAMED_IMPORT_FROM_ANTD, (statement: string, list: string) => {
		const kept: string[] = [];
		const imports: string[] = [];
		for (const raw of list.split(',')) {
			const specifier = raw.trim();
			if (!specifier) {
				continue;
			}
			const match = specifier.match(IMPORT_SPECIFIER);
			const modulePath = match && exportsByName.get(match[1]);
			if (!match || !modulePath) {
				kept.push(specifier);
				unresolved.push(specifier);
				continue;
			}
			imports.push(`import ${match[2] ?? match[1]} from '${modulePath}';`);
		}
		if (imports.length === 0) {
			return statement;
		}
		changed = true;
		if (kept.length > 0) {
			imports.push(`import { ${kept.join(', ')} } from 'antd';`);
		}
		const lineBreaks = statement.split('\n').length - 1;
		return imports.join(' ') + '\n'.repeat(lineBreaks);
	});

	return changed ? { code: rewritten, unresolved } : null;
}

/**
 * Vite plugin that applies rewriteAntdImports to the app's own modules in
 * production builds. It runs after the TypeScript transform, so type-only
 * names (`MenuProps`...) are already gone from the import lists.
 */
export function antdDeepImports(projectRoot: string): Plugin {
	let exportsByName = new Map<string, string>();

	return {
		name: 'aoitube:antd-deep-imports',
		apply: 'build',

		buildStart() {
			const barrel = path.join(projectRoot, 'node_modules/antd/es/index.js');
			exportsByName = readAntdExports(fs.readFileSync(barrel, 'utf8'));
			// A silent no-op would quietly put all of antd back into the first
			// load; an antd release that reshapes its index file should fail here.
			if (!exportsByName.has('Button') || exportsByName.size < 40) {
				this.error(
					`antd-deep-imports: could not read the component list from ${barrel} ` +
						`(found ${exportsByName.size} exports). antd's index file changed shape; ` +
						'update web/vite-plugins/antdDeepImports.ts.',
				);
			}
		},

		transform(code, id) {
			if (id.includes('/node_modules/') || !/\.[jt]sx?(?:$|\?)/.test(id) || !code.includes('antd')) {
				return null;
			}
			const result = rewriteAntdImports(code, exportsByName);
			if (!result) {
				return null;
			}
			if (result.unresolved.length > 0) {
				this.warn(
					`antd-deep-imports: ${path.relative(projectRoot, id)} still imports ` +
						`${result.unresolved.join(', ')} from the antd barrel.`,
				);
			}
			// The rewrite keeps line numbers, so the existing source map still fits.
			return { code: result.code, map: null };
		},
	};
}
