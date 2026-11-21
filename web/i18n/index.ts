// Client-side i18n for the viewer UI.
// The site is statically exported (no server), so language detection happens
// in the browser: saved preference first, then navigator.language, falling
// back to English. Pre-rendered HTML is generated in Japanese (the primary
// audience) and re-renders after hydration when another language is detected.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Japanese ships in the bundle: it is the primary audience's language and the
// last fallback, so `t` always has an answer. The other catalogs are about
// 100 KB each and are fetched only when their language is in use (see
// loadCatalog). Bundling all five cost every visitor some 300 KB they never
// read.
import ja from './locales/ja.json';

export const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
	{ code: 'ja', label: '日本語' },
	{ code: 'en', label: 'English' },
	{ code: 'zh', label: '简体中文' },
	{ code: 'zh-TW', label: '繁體中文' },
	{ code: 'ko', label: '한국어' },
];

const BUNDLED_LANGUAGE = 'ja';
const NAMESPACE = 'translation';

type Catalog = Record<string, unknown>;

const catalogLoaders: Record<string, () => Promise<{ default: Catalog }>> = {
	en: () => import('./locales/en.json'),
	zh: () => import('./locales/zh.json'),
	'zh-TW': () => import('./locales/zh-TW.json'),
	ko: () => import('./locales/ko.json'),
};

const isServer = typeof window === 'undefined';

if (!isServer) {
	i18n.use(LanguageDetector);
}

i18n.use(initReactI18next).init({
	resources: {
		[BUNDLED_LANGUAGE]: { [NAMESPACE]: ja },
	},
	// Static pre-render uses Japanese; browsers detect their own language.
	...(isServer ? { lng: BUNDLED_LANGUAGE } : {}),
	// A language we have no catalog for resolves to English. Every catalog has
	// the same keys (`npm run check:i18n` enforces it), so within a supported
	// language this chain only matters while its catalog is still on its way,
	// or failed to load: the text is then Japanese.
	fallbackLng: ['en', 'ja'],
	supportedLngs: ['ja', 'en', 'zh', 'zh-TW', 'ko'],
	interpolation: { escapeValue: false }, // React already escapes
	detection: {
		order: ['localStorage', 'navigator'],
		caches: ['localStorage'],
		lookupLocalStorage: 'aoitubeLanguage',
		convertDetectedLanguage: (lng: string) => {
			const lower = lng.toLowerCase();
			if (lower.startsWith('zh')) {
				// Traditional-script regions map to zh-TW, everything else to zh.
				return /tw|hk|mo|hant/.test(lower) ? 'zh-TW' : 'zh';
			}
			return lng.split('-')[0];
		},
	},
	react: {
		useSuspense: false,
		// Re-render when a catalog arrives after the first paint.
		bindI18nStore: 'added',
	},
});

const inFlight = new Map<string, Promise<void>>();

/**
 * Makes a language's catalog available, fetching it on first use. Resolves at
 * once for the bundled language, a catalog that is already loaded, and a
 * language we have no catalog for.
 */
export function loadCatalog(language: string): Promise<void> {
	const load = catalogLoaders[language];
	if (!load || i18n.hasResourceBundle(language, NAMESPACE)) {
		return Promise.resolve();
	}

	let pending = inFlight.get(language);
	if (!pending) {
		pending = load()
			.then(module => {
				i18n.addResourceBundle(language, NAMESPACE, module.default, true, true);
			})
			.finally(() => {
				inFlight.delete(language);
			});
		inFlight.set(language, pending);
	}
	return pending;
}

/**
 * Switches the UI language, fetching its catalog first. Use this instead of
 * `i18n.changeLanguage`, which would switch to a language whose text isn't
 * there yet.
 */
export async function changeLanguage(language: string): Promise<void> {
	try {
		await loadCatalog(language);
	} catch (error) {
		// Switch anyway: the text falls back to Japanese until a reload.
		console.error(`unable to load the ${language} translations`, error);
	}
	await i18n.changeLanguage(language);
}

// How long the first render waits for the visitor's catalog. Past this the
// page renders in Japanese and switches when the catalog arrives, so a slow
// request can't hold it blank.
const CATALOG_WAIT_MS = 3000;

/**
 * Resolves when the UI can render in the visitor's language. The entry points
 * wait for it before the first render, which avoids a flash of Japanese text
 * for everyone else. It never rejects.
 */
export const i18nReady: Promise<void> = Promise.race([
	loadCatalog(i18n.language).catch(error => {
		console.error(`unable to load the ${i18n.language} translations`, error);
	}),
	new Promise<void>(resolve => {
		setTimeout(resolve, CATALOG_WAIT_MS);
	}),
]);

export default i18n;
