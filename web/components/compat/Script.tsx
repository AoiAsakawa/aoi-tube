/**
 * Framework-agnostic external-script indirection.
 *
 * Reimplemented without Next.js: appends a real <script> element on mount (which
 * executes, unlike React-rendered inline scripts) and removes it on unmount. The
 * Next.js `strategy` prop is accepted and ignored.
 */
import { FC, useEffect } from 'react';

export interface ScriptProps {
	src?: string;
	id?: string;
	strategy?: 'afterInteractive' | 'lazyOnload' | 'beforeInteractive' | 'worker';
	onLoad?: () => void;
	onError?: () => void;
	children?: string;
	[key: string]: unknown;
}

export const Script: FC<ScriptProps> = ({
	src,
	id,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	strategy,
	onLoad,
	onError,
	children,
	...rest
}) => {
	useEffect(() => {
		if (id && document.getElementById(id)) return undefined;

		const el = document.createElement('script');
		if (src) el.src = src;
		if (id) el.id = id;
		el.async = true;
		if (typeof children === 'string') el.textContent = children;
		Object.entries(rest).forEach(([key, value]) => {
			if (typeof value === 'string') el.setAttribute(key, value);
		});
		if (onLoad) el.addEventListener('load', onLoad);
		if (onError) el.addEventListener('error', onError);

		document.body.appendChild(el);
		return () => {
			el.remove();
		};
	}, [src, id]);

	return null;
};

export default Script;
