import { useEffect, ReactElement } from 'react';
import { useRouter } from '@components/compat/router';

import { AdminLayout } from '../../components/layouts/AdminLayout';

// The federation settings now live inside the notifications page.
export default function ConfigFederationRedirect() {
	const router = useRouter();
	useEffect(() => {
		router.replace('/admin/config-notify');
	}, [router]);
	return null;
}

ConfigFederationRedirect.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
