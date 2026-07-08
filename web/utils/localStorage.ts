// Player volume (0..1, 0 doubling as muted) shared by the HLS and WebRTC
// players so switching playback modes keeps the same audio level.
export const PLAYER_VOLUME = 'owncast_volume';

// Preferred HLS playback quality: 'auto' or a rendition height like '720'.
// Persisted so a viewer who pins a quality keeps it across reloads.
export const PLAYER_QUALITY = 'owncast_quality';

export const LOCAL_STORAGE_KEYS = {
	username: 'username',
	hasDisplayedNotificationModal: 'HAS_DISPLAYED_NOTIFICATION_MODAL',
	userVisitCount: 'USER_VISIT_COUNT',
};

export function getLocalStorage(key) {
	try {
		return localStorage.getItem(key);
	} catch (e) {
		console.error(e);
	}
	return null;
}

export function setLocalStorage(key, value) {
	try {
		if (value !== '' && value !== null) {
			localStorage.setItem(key, value);
		} else {
			localStorage.removeItem(key);
		}
		return true;
	} catch (e) {
		console.error(e);
	}
	return false;
}
