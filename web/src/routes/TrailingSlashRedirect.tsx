import { FC } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

// Normalises trailing slashes so links written both ways (and the Go server's
// trailingSlash-era deep links) resolve to a single canonical route.
export const TrailingSlashRedirect: FC = () => {
	const { pathname, search, hash } = useLocation();
	if (pathname.length > 1 && pathname.endsWith('/')) {
		return <Navigate to={pathname.replace(/\/+$/, '') + search + hash} replace />;
	}
	return <Outlet />;
};

export default TrailingSlashRedirect;
