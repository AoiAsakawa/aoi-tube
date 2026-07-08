/**
 * Framework-agnostic Link indirection.
 *
 * Reimplemented on react-router: internal paths render a react-router <Link>
 * (client-side navigation); external URLs, mailto/tel and explicit new-tab
 * targets fall back to a plain <a>. Accepts the Next.js `href` prop name and
 * swallows Next-only props so call sites need no changes.
 */
import React, { AnchorHTMLAttributes, FC } from 'react';
import { Link as RouterLink } from 'react-router-dom';

export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
	href: string;
	// Next.js <Link> props that have no react-router equivalent; accepted and
	// ignored so existing call sites keep type-checking.
	prefetch?: boolean;
	replace?: boolean;
	scroll?: boolean;
	shallow?: boolean;
	passHref?: boolean;
	legacyBehavior?: boolean;
	locale?: string | false;
};

const isExternal = (href: string): boolean =>
	/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) ||
	href.startsWith('mailto:') ||
	href.startsWith('tel:') ||
	href.startsWith('#');

export const Link: FC<LinkProps> = ({
	href,
	replace,
	target,
	children,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	prefetch,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	scroll,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	shallow,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	passHref,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	legacyBehavior,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	locale,
	...rest
}) => {
	if (href == null || isExternal(href) || (target && target !== '_self')) {
		return (
			<a href={href} target={target} {...rest}>
				{children}
			</a>
		);
	}
	return (
		<RouterLink to={href} replace={replace} target={target} {...rest}>
			{children}
		</RouterLink>
	);
};

export default Link;
