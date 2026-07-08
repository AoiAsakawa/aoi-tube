import type { Locale } from 'date-fns';
import { enUS, ja, ko, zhCN, zhTW } from 'date-fns/locale';

const LOCALE_MAP: Record<string, Locale> = {
	ja,
	en: enUS,
	zh: zhCN,
	'zh-TW': zhTW,
	ko,
};

// Maps an i18next language code to the matching date-fns locale so relative
// times ("3分前") follow the viewer's UI language instead of being pinned.
export function getDateFnsLocale(language: string): Locale {
	if (LOCALE_MAP[language]) {
		return LOCALE_MAP[language];
	}
	const base = language.split('-')[0];
	return LOCALE_MAP[base] ?? enUS;
}
