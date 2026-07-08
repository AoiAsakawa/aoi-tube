// Stream media endpoints (HLS, thumbnails, WebRTC signaling) gate restricted
// streams (silent test mode, required social auth) by resolving the viewer
// from an accessToken query parameter. XHR-based HLS requests get the token
// from the VideoJS request hook, but plain <img>/fetch requests must append
// it themselves via this helper.
export const withAccessToken = (url: string): string => {
	const accessToken = window.localStorage.getItem('accessToken');
	if (!accessToken) {
		return url;
	}
	return `${url}${url.includes('?') ? '&' : '?'}accessToken=${encodeURIComponent(accessToken)}`;
};
