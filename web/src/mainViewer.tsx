// Viewer entry point (index.html). Replaces the Next.js pages/_app.tsx bootstrap
// for the public-facing UI: global stylesheets, fonts, i18n, antd provider and
// the react-router route table.

// Fonts — formerly next/font/google (Inter, Poppins). @fontsource provides the
// @font-face rules; src/fonts.css exposes the --font-inter / --font-poppins
// variables consumed by styles/variables.css.
import '@fontsource-variable/inter/index.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/600.css';
import './fonts.css';

// order matters! (mirrors the former pages/_app.tsx import order)
import '../styles/variables.css';
import '../styles/globals.scss';
import '../styles/ant-overrides.scss';

import '../i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { App } from './App';
import { viewerRouter } from './routes/viewer';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App>
			<RouterProvider router={viewerRouter} />
		</App>
	</StrictMode>,
);
