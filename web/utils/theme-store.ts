/**
 * Site-wide dark/light theme as a tiny external store.
 *
 * Kept outside zustand so it can be read above all providers at startup
 * via useSyncExternalStore. The choice is persisted in localStorage and
 * mirrored to a data-theme attribute on <html>, which stylesheets key off of.
 * Dark is the default (the site's original design).
 */

export type SiteTheme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'owncastTheme';

let currentTheme: SiteTheme = 'dark';
const listeners = new Set<() => void>();

const applyToDocument = (theme: SiteTheme) => {
	if (typeof document !== 'undefined') {
		document.documentElement.dataset.theme = theme;
	}
};

// Initialize from localStorage on the client. Runs once at module load.
if (typeof window !== 'undefined') {
	const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
	if (saved === 'light' || saved === 'dark') {
		currentTheme = saved;
	}
	applyToDocument(currentTheme);
}

export const getTheme = (): SiteTheme => currentTheme;

// Fallback snapshot for useSyncExternalStore when no DOM is available.
export const getServerTheme = (): SiteTheme => 'dark';

export const setTheme = (theme: SiteTheme): void => {
	if (theme === currentTheme) {
		return;
	}
	currentTheme = theme;
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	}
	applyToDocument(theme);
	listeners.forEach(listener => listener());
};

export const toggleTheme = (): void => {
	setTheme(currentTheme === 'dark' ? 'light' : 'dark');
};

export const subscribeTheme = (listener: () => void): (() => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};
