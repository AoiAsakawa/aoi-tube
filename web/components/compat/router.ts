/**
 * Framework-agnostic router indirection.
 *
 * Reimplemented on react-router's useLocation/useNavigate. Exposes the small
 * Next.js router surface the app relies on: push, replace, back, reload,
 * pathname, route, asPath and a parsed query object. Pathname/route are
 * normalised without a trailing slash so admin menu key matching keeps working.
 */
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export interface CompatRouter {
	pathname: string;
	route: string;
	asPath: string;
	query: Record<string, string>;
	push: (url: string) => void;
	replace: (url: string) => void;
	back: () => void;
	reload: () => void;
}

export const useRouter = (): CompatRouter => {
	const location = useLocation();
	const navigate = useNavigate();

	const pathname =
		location.pathname.length > 1 ? location.pathname.replace(/\/+$/, '') : location.pathname;

	const query = useMemo(() => {
		const out: Record<string, string> = {};
		new URLSearchParams(location.search).forEach((value, key) => {
			out[key] = value;
		});
		return out;
	}, [location.search]);

	const push = useCallback((url: string) => navigate(url), [navigate]);
	const replace = useCallback((url: string) => navigate(url, { replace: true }), [navigate]);
	const back = useCallback(() => navigate(-1), [navigate]);
	const reload = useCallback(() => window.location.reload(), []);

	return {
		pathname,
		route: pathname,
		asPath: location.pathname + location.search + location.hash,
		query,
		push,
		replace,
		back,
		reload,
	};
};

export default useRouter;
