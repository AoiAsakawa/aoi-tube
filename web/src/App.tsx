import { FC, ReactNode, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import type { Locale } from 'antd/es/locale';
import jaJP from 'antd/locale/ja_JP';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import zhTW from 'antd/locale/zh_TW';
import koKR from 'antd/locale/ko_KR';
import { useTranslation } from 'react-i18next';
import { useSiteTheme } from '../utils/useSiteTheme';

// Ant Design locales matched to the detected UI language.
const ANTD_LOCALES: Record<string, Locale> = {
	ja: jaJP,
	en: enUS,
	zh: zhCN,
	'zh-TW': zhTW,
	ko: koKR,
};

// antd theme tokens per site theme. The dark set mirrors the site's original
// dark design so antd-rendered UI (buttons, selects, modals, icons) matches
// without CSS override wars; the light set is the original light configuration.
const antdLightTheme = {
	algorithm: theme.defaultAlgorithm,
	token: {
		colorPrimary: '#6544e9',
		colorLink: '#6544e9',
		colorLinkHover: '#7a5cf3',
		borderRadius: 4,
		colorBgContainer: '#ffffff',
		colorBgLayout: '#e2e8f0',
		colorText: '#2d3748',
		colorTextSecondary: '#4a5568',
		colorTextTertiary: '#718096',
		colorTextDescription: '#4a5568',
	},
	components: {
		Layout: {
			headerBg: '#e2e8f0',
			// The admin sidebar is INTENTIONALLY dark in light mode too (classic
			// dashboard shell). public/styles/admin/main-layout.css pins the same
			// #2d3748 with !important — change both together if this ever flips.
			siderBg: '#2d3748',
			bodyBg: '#e2e8f0',
		},
		Menu: {
			darkItemBg: '#2d3748',
			darkSubMenuItemBg: '#1a202c',
			darkItemSelectedBg: '#6544e9',
			darkItemColor: '#e2e8f0',
			darkItemHoverBg: '#4a5568',
		},
		Button: {
			primaryColor: '#ffffff',
		},
	},
};

const antdDarkTheme = {
	algorithm: theme.darkAlgorithm,
	token: {
		colorPrimary: '#6544e9',
		colorLink: '#667eea',
		colorLinkHover: '#7a5cf3',
		borderRadius: 4,
		colorBgContainer: '#2a2d38',
		colorBgElevated: '#2a2d38',
		colorBgLayout: '#0d0d14',
		colorText: '#e2e8f0',
		colorTextSecondary: '#a0aec0',
		colorTextTertiary: '#718096',
		colorTextDescription: '#a0aec0',
		colorBorder: '#4a4d58',
		colorBorderSecondary: '#3b4252',
	},
	components: {
		Layout: {
			headerBg: '#1a1d24',
			siderBg: '#1a202c',
			bodyBg: '#0d0d14',
		},
		Modal: {
			contentBg: '#1a1d24',
			headerBg: '#1a1d24',
			footerBg: '#1a1d24',
		},
		Menu: {
			darkItemBg: '#2d3748',
			darkSubMenuItemBg: '#1a202c',
			darkItemSelectedBg: '#6544e9',
			darkItemColor: '#e2e8f0',
			darkItemHoverBg: '#4a5568',
		},
		Button: {
			primaryColor: '#ffffff',
		},
	},
};

// Shared application shell (formerly pages/_app.tsx): antd ConfigProvider wired
// to the site theme + detected language, and document language synchronisation.
export const App: FC<{ children: ReactNode }> = ({ children }) => {
	const { i18n } = useTranslation();
	const { theme: siteTheme } = useSiteTheme();

	// Keep the document language in sync with the detected UI language.
	useEffect(() => {
		document.documentElement.lang = i18n.language;
	}, [i18n.language]);

	return (
		<ConfigProvider
			theme={siteTheme === 'light' ? antdLightTheme : antdDarkTheme}
			locale={ANTD_LOCALES[i18n.language] ?? enUS}
		>
			{children}
		</ConfigProvider>
	);
};

export default App;
