// Client-side i18n for the viewer UI.
// The site is statically exported (no server), so language detection happens
// in the browser: saved preference first, then navigator.language, falling
// back to English. Pre-rendered HTML is generated in Japanese (the primary
// audience) and re-renders after hydration when another language is detected.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ja from './locales/ja.json';
import en from './locales/en.json';
import zh from './locales/zh.json';
import zhTW from './locales/zh-TW.json';
import ko from './locales/ko.json';

export const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
	{ code: 'ja', label: '日本語' },
	{ code: 'en', label: 'English' },
	{ code: 'zh', label: '简体中文' },
	{ code: 'zh-TW', label: '繁體中文' },
	{ code: 'ko', label: '한국어' },
];

const isServer = typeof window === 'undefined';

if (!isServer) {
	i18n.use(LanguageDetector);
}

i18n.use(initReactI18next).init({
	resources: {
		ja: { translation: ja },
		en: { translation: en },
		zh: { translation: zh },
		'zh-TW': { translation: zhTW },
		ko: { translation: ko },
	},
	// Static pre-render uses Japanese; browsers detect their own language.
	...(isServer ? { lng: 'ja' } : {}),
	// Fall back to English, then Japanese. The viewer UI is fully translated
	// in every locale, so only admin keys (currently Japanese-only) fall
	// through to `ja` until their en/zh/zh-TW/ko translations land.
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
	react: { useSuspense: false },
});

export default i18n;
