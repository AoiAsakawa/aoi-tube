import { useSyncExternalStore } from 'react';
import {
	SiteTheme,
	getServerTheme,
	getTheme,
	subscribeTheme,
	toggleTheme,
} from './theme-store';

export type { SiteTheme };

// React binding for the site theme store. All subscribers (header toggle,
// antd ConfigProvider in _app) stay in sync through the shared store.
export const useSiteTheme = (): { theme: SiteTheme; toggleTheme: () => void } => {
	const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
	return { theme, toggleTheme };
};
