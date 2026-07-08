/**
 * Framework-agnostic document-head indirection.
 *
 * Reimplemented without Next.js: `<title>` children set `document.title`
 * imperatively (last writer wins, matching Next's title de-duplication and
 * letting TitleNotifier keep updating the tab title), while every other child
 * (meta/link/script/base) is portaled into <head>. React removes portaled nodes
 * on unmount, so head content stays scoped to the mounted component.
 */
import { Children, FC, ReactElement, ReactNode, isValidElement, useEffect } from 'react';
import { createPortal } from 'react-dom';

const extractText = (node: ReactNode): string => {
	if (node == null || node === false || node === true) return '';
	if (typeof node === 'string' || typeof node === 'number') return String(node);
	if (Array.isArray(node)) return node.map(extractText).join('');
	if (isValidElement(node)) return extractText((node.props as { children?: ReactNode }).children);
	return '';
};

export const Head: FC<{ children?: ReactNode }> = ({ children }) => {
	const items = Children.toArray(children);
	const isTitle = (c: ReactNode): c is ReactElement => isValidElement(c) && c.type === 'title';
	const titleEl = items.find(isTitle);
	const rest = items.filter(c => !isTitle(c));
	const title = titleEl
		? extractText((titleEl.props as { children?: ReactNode }).children)
		: undefined;

	useEffect(() => {
		if (title) {
			document.title = title;
		}
	}, [title]);

	if (typeof document === 'undefined') return null;
	return createPortal(<>{rest}</>, document.head);
};

export default Head;
