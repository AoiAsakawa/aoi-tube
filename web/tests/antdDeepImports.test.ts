// The node: prefix matters: a bare 'path' resolves to the browser polyfill
// package in node_modules.
import fs from 'node:fs';
import path from 'node:path';
import { readAntdExports, rewriteAntdImports } from '../vite-plugins/antdDeepImports';

const antdRoot = path.resolve(process.cwd(), 'node_modules/antd/es');
const realExports = readAntdExports(fs.readFileSync(path.join(antdRoot, 'index.js'), 'utf8'));

describe('readAntdExports', () => {
	test('reads the component list from the installed antd', () => {
		// The plugin refuses to build below 40; antd 6 has about 75.
		expect(realExports.size).toBeGreaterThan(60);
		expect(realExports.get('Button')).toBe('antd/es/button');
		expect(realExports.get('ConfigProvider')).toBe('antd/es/config-provider');
		expect(realExports.get('Table')).toBe('antd/es/table');
		expect(realExports.get('message')).toBe('antd/es/message');
		expect(realExports.get('theme')).toBe('antd/es/theme');
	});

	test('every mapped module exists and has a default export to import', () => {
		const missing: string[] = [];
		realExports.forEach((modulePath, name) => {
			const file = path.join(antdRoot, modulePath.replace('antd/es/', ''), 'index.js');
			if (!fs.existsSync(file) || !/export default /.test(fs.readFileSync(file, 'utf8'))) {
				missing.push(`${name} -> ${modulePath}`);
			}
		});
		expect(missing).toEqual([]);
	});

	test('ignores lines that are not a plain default re-export', () => {
		const source = [
			'"use client";',
			"import warning from './_util/warning';",
			'export const unstableSetRender = () => {};',
			"export { default as Affix } from './affix';",
			"export { default as AutoComplete } from './auto-complete';",
		].join('\n');
		expect([...readAntdExports(source)]).toEqual([
			['Affix', 'antd/es/affix'],
			['AutoComplete', 'antd/es/auto-complete'],
		]);
	});
});

describe('rewriteAntdImports', () => {
	const exportsByName = new Map([
		['Button', 'antd/es/button'],
		['Modal', 'antd/es/modal'],
		['ConfigProvider', 'antd/es/config-provider'],
	]);

	test('turns a barrel import into one default import per component', () => {
		const result = rewriteAntdImports(`import { Button, Modal } from 'antd';\nfoo();`, exportsByName);
		expect(result).toEqual({
			code: `import Button from 'antd/es/button'; import Modal from 'antd/es/modal';\nfoo();`,
			unresolved: [],
		});
	});

	test('keeps local aliases', () => {
		const result = rewriteAntdImports(`import { Modal as AntModal } from "antd";`, exportsByName);
		expect(result?.code).toBe(`import AntModal from 'antd/es/modal';`);
	});

	test('keeps the line count of a multi-line import', () => {
		const code = ['import {', '\tButton,', '\tConfigProvider,', "} from 'antd';", 'next();'].join('\n');
		const result = rewriteAntdImports(code, exportsByName);
		expect(result?.code.split('\n')).toHaveLength(code.split('\n').length);
		expect(result?.code.split('\n').at(-1)).toBe('next();');
		expect(result?.code).toContain(`import Button from 'antd/es/button';`);
		expect(result?.code).toContain(`import ConfigProvider from 'antd/es/config-provider';`);
	});

	test('leaves names the barrel does not re-export on a barrel import and reports them', () => {
		const result = rewriteAntdImports(
			`import { Button, unstableSetRender } from 'antd';`,
			exportsByName,
		);
		expect(result).toEqual({
			code: `import Button from 'antd/es/button'; import { unstableSetRender } from 'antd';`,
			unresolved: ['unstableSetRender'],
		});
	});

	test('rewrites every barrel import in a module', () => {
		const code = `import { Button } from 'antd';\nimport x from './x';\nimport { Modal } from 'antd';`;
		expect(rewriteAntdImports(code, exportsByName)?.code).toBe(
			`import Button from 'antd/es/button';\nimport x from './x';\nimport Modal from 'antd/es/modal';`,
		);
	});

	test('returns null when there is nothing to rewrite', () => {
		expect(rewriteAntdImports(`import Button from 'antd/es/button';`, exportsByName)).toBeNull();
		expect(rewriteAntdImports(`import { locale } from 'antd/locale';`, exportsByName)).toBeNull();
		expect(rewriteAntdImports(`import * as antd from 'antd';`, exportsByName)).toBeNull();
		expect(rewriteAntdImports(`import('antd').then(m => m.Tabs);`, exportsByName)).toBeNull();
		expect(rewriteAntdImports(`import { unknownThing } from 'antd';`, exportsByName)).toBeNull();
	});
});
