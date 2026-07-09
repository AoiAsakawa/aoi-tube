// Admin entry point (admin/index.html). Kept as a separate bundle from the
// viewer so the large admin-only antd surface is not shipped to viewers.

// Fonts — formerly next/font/google (Inter, Poppins).
import '@fontsource-variable/inter/index.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/600.css';
import './fonts.css';

// order matters! (mirrors the former pages/_app.tsx import order)
import '../styles/variables.css';
import '../styles/globals.scss';
import '../styles/ant-overrides.scss';
import '../styles/admin.scss';

import '../i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { App } from './App';
import { adminRouter } from './routes/admin';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App>
			<RouterProvider router={adminRouter} />
		</App>
	</StrictMode>,
);
