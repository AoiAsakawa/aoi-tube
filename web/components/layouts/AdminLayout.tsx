import { FC, ReactElement } from 'react';
import ServerStatusProvider from '../../utils/server-status-context';
import AlertMessageProvider from '../../utils/alert-message-context';
import { MainLayout } from '../admin/MainLayout';

/* The legacy admin stylesheets live in web/styles/admin.scss (bundled via
   src/mainAdmin.tsx) — they are no longer injected as runtime <link> tags. */

type AdminLayoutProps = {
	page: ReactElement;
};

export const AdminLayout: FC<AdminLayoutProps> = ({ page }) => (
	<>
		<ServerStatusProvider>
			<AlertMessageProvider>
				<MainLayout>{page}</MainLayout>
			</AlertMessageProvider>
		</ServerStatusProvider>
	</>
);
