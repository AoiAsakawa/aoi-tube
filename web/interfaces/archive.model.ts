// Shape of a recorded stream archive (VOD) as returned by the archive APIs.
// The public `GET /api/archives` endpoint returns only visible, finished
// archives; the admin `GET /api/admin/archives` endpoint returns every
// archive including hidden and unfinished ones.
export interface Archive {
	id: string;
	title: string;
	// ISO-8601 timestamps.
	startedAt: string;
	endedAt: string;
	durationSeconds: number;
	// Output variant indexes available for this archive (e.g. [0, 1]).
	variants: number[];
	// Optional thumbnail URL.
	thumbnail?: string;
	// Human rendition label of the recording, e.g. "1080p60".
	quality?: string;
	// Filename of the single-file progressive remux ("replay.mp4") when the
	// recording has one; preferred over the HLS playlist for playback.
	mp4?: string;
	// Total size of the session's media files in bytes. Absent on manifests
	// that predate the field until the admin listing backfills them.
	sizeBytes?: number;
	visible: boolean;
	// Whether the recording finished cleanly (false if the stream crashed mid-way).
	finishedOk: boolean;
	// Access model: "public" (or omitted) plays for everyone, "authenticated"
	// requires any logged-in viewer, "paid" is a pay-per-view purchase.
	accessMode?: string;
	// Purchase price for paid archives, in the currency's smallest unit (yen
	// for JPY, cents for other currencies). Present only when accessMode="paid".
	price?: number;
	// ISO currency code for `price` (e.g. "JPY").
	currency?: string;
	// True when the currently-authenticated viewer already owns this paid
	// archive. Always false for anonymous viewers and free archives.
	purchased?: boolean;
}

// Formats a paid-archive price for display. `price` is in the currency's
// smallest unit (yen for JPY, cents for other currencies), matching the
// recording manifest. JPY renders as a plain yen amount with no decimals;
// every other currency is converted to major units and formatted with
// Intl.NumberFormat so the correct symbol and grouping appear.
// "1:23:45" / "23:45" duration label from a second count.
export function formatArchiveDuration(durationSeconds: number): string {
	const total = Number.isFinite(durationSeconds) ? Math.max(0, Math.floor(durationSeconds)) : 0;
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const sec = total % 60;
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
	const ss = String(sec).padStart(2, '0');
	return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatArchivePrice(price: number, currency?: string, locale?: string): string {
	const code = (currency || 'JPY').toUpperCase();
	const value = Number.isFinite(price) ? price : 0;
	if (code === 'JPY') {
		return `¥${Math.round(value).toLocaleString(locale)}`;
	}
	try {
		return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(value / 100);
	} catch (_error) {
		// Unknown/invalid currency codes make Intl throw; fall back to a plain
		// two-decimal amount with the raw code appended.
		return `${(value / 100).toFixed(2)} ${code}`;
	}
}

// A single broadcast event recorded during a stream, returned by
// `GET /api/archives/events/<id>` for synchronized VOD replay. `offsetMs` is
// the delay from stream start; `payload` is the same shape the live viewer's
// websocket handler (ClientConfigStore.handleMessage) processes, so its
// `type` is one of the MessageType chat/donation values.
export interface ArchiveEvent {
	offsetMs: number;
	payload: any;
}
