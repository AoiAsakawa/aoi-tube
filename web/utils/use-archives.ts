import { useCallback, useEffect, useState } from 'react';
import { Archive } from '../interfaces/archive.model';
import { useAccessToken } from '../components/stores/zustand-store';
import { ARCHIVES, getUnauthedData, withArchiveAccessToken } from './apis';

// Module-level cache so Footer and the /archives page share one
// GET /api/archives instead of firing duplicate requests per mount. The cache
// is keyed by access token because the response carries a per-viewer
// `purchased` flag: a different token (login/logout) must not reuse a stale
// list. The list only changes when a recording finishes or is purchased, so a
// per-page-load cache is fine; call sites remount on navigation and can force
// a refresh after returning from a payment.
let cache: { token: string | null; archives: Archive[] } | null = null;
let inflight: Promise<Archive[]> | null = null;
let inflightToken: string | null = null;

async function fetchArchives(token: string | null, force = false): Promise<Archive[]> {
	if (!force && cache && cache.token === token) {
		return cache.archives;
	}
	if (inflight && inflightToken === token && !force) {
		return inflight;
	}
	inflightToken = token;
	inflight = getUnauthedData(withArchiveAccessToken(ARCHIVES, token))
		.then((response: unknown) => {
			const list = Array.isArray(response) ? (response as Archive[]) : [];
			cache = { token, archives: list };
			inflight = null;
			return list;
		})
		.catch(() => {
			inflight = null;
			// Preserve any previously cached list on transient failures.
			return cache?.archives ?? [];
		});
	return inflight;
}

export function useArchives(): {
	archives: Archive[];
	loading: boolean;
	refresh: () => Promise<void>;
} {
	const token = useAccessToken();
	const cachedForToken = cache && cache.token === token ? cache.archives : null;
	const [archives, setArchives] = useState<Archive[]>(cachedForToken ?? []);
	const [loading, setLoading] = useState(cachedForToken === null);

	useEffect(() => {
		let mounted = true;
		if (!(cache && cache.token === token)) {
			setLoading(true);
		}
		fetchArchives(token).then(list => {
			if (mounted) {
				setArchives(list);
				setLoading(false);
			}
		});
		return () => {
			mounted = false;
		};
	}, [token]);

	// Force a fresh fetch, e.g. after returning from a payment so a newly
	// purchased archive flips to `purchased: true`.
	const refresh = useCallback(async () => {
		const list = await fetchArchives(token, true);
		setArchives(list);
		setLoading(false);
	}, [token]);

	return { archives, loading, refresh };
}
