import ja from '../i18n/locales/ja.json';
import en from '../i18n/locales/en.json';
import ko from '../i18n/locales/ko.json';

// Any key works; this one is short and differs in every catalog.
const KEY = 'chat.sendMessage';
const text = (catalog: { chat: { sendMessage: string } }) => catalog.chat.sendMessage;

// The module detects the language and starts loading its catalog when it is
// imported, so every test imports a fresh copy with its own saved preference.
async function importI18n(savedLanguage?: string) {
	vi.resetModules();
	window.localStorage.clear();
	if (savedLanguage) {
		window.localStorage.setItem('aoitubeLanguage', savedLanguage);
	}
	return import('../i18n');
}

describe('i18n catalogs', () => {
	test('the three sample catalogs really differ, or the checks below prove nothing', () => {
		expect(new Set([text(ja), text(en), text(ko)]).size).toBe(3);
	});

	test('Japanese is bundled and loads no other catalog', async () => {
		const { default: i18n, i18nReady } = await importI18n('ja');

		expect(i18n.t(KEY)).toBe(text(ja));
		await i18nReady;
		expect(i18n.t(KEY)).toBe(text(ja));
		expect(i18n.hasResourceBundle('en', 'translation')).toBe(false);
	});

	test('another language answers in Japanese until its catalog arrives', async () => {
		const { default: i18n, i18nReady } = await importI18n('en');

		// Synchronously after import: nothing fetched yet, but `t` has an answer.
		expect(i18n.language).toBe('en');
		expect(i18n.t(KEY)).toBe(text(ja));

		await i18nReady;
		expect(i18n.t(KEY)).toBe(text(en));
		expect(i18n.hasResourceBundle('ko', 'translation')).toBe(false);
	});

	test('a language without a catalog resolves to English', async () => {
		const { default: i18n, i18nReady } = await importI18n('fr');

		await i18nReady;
		expect(i18n.language).toBe('en');
		expect(i18n.t(KEY)).toBe(text(en));
	});

	test('changeLanguage fetches the catalog before switching', async () => {
		const { default: i18n, i18nReady, changeLanguage } = await importI18n('ja');
		await i18nReady;

		await changeLanguage('ko');

		expect(i18n.language).toBe('ko');
		expect(i18n.t(KEY)).toBe(text(ko));
		// The preference is what the next visit starts from.
		expect(window.localStorage.getItem('aoitubeLanguage')).toBe('ko');
	});

	test('loadCatalog resolves for a language it has nothing to load for', async () => {
		const { default: i18n, loadCatalog } = await importI18n('ja');

		await expect(loadCatalog('ja')).resolves.toBeUndefined();
		await expect(loadCatalog('xx')).resolves.toBeUndefined();
		expect(i18n.hasResourceBundle('xx', 'translation')).toBe(false);
	});

	test('concurrent requests for one catalog share a single load', async () => {
		const { default: i18n, loadCatalog } = await importI18n('ja');
		const added = vi.spyOn(i18n, 'addResourceBundle');

		await Promise.all([loadCatalog('zh'), loadCatalog('zh'), loadCatalog('zh')]);
		await loadCatalog('zh');

		expect(added).toHaveBeenCalledTimes(1);
		expect(i18n.hasResourceBundle('zh', 'translation')).toBe(true);
	});
});
